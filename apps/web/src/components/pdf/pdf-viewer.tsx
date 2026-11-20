"use client";

// The PDF canvas host (spec §8.1/§8.2): one canvas per visible page, white
// sheet, `--bg-preview` page background, virtualised by an IntersectionObserver.

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfDocument } from "./use-pdf-document";

export interface PdfViewerHandle {
  scrollTo(page: number, xFraction: number, yFraction: number): void;
  revealLineRect(
    page: number,
    rect: { x: number; y: number; width: number; height: number },
  ): void;
  getPageGeometry(page: number): { width: number; height: number } | null;
  /** Scroll a whole page into view and report it as the current page. */
  goToPage(page: number): void;
  /**
   * Percentage that makes page 1 as wide as the viewport allows, or null when
   * the document or host is not ready. "Zoom to fit" is this number — it used
   * to be a hardcoded 100, which is why the control did nothing.
   */
  fitWidth(): Promise<number | null>;
}

/** Horizontal padding of the viewport (p-2 on both sides). */
const VIEWPORT_PADDING = 16;
/** Width of a classic vertical scrollbar track, reserved unconditionally. */
const SCROLLBAR_RESERVE = 16;

/**
 * Percentage that makes a page as wide as the viewport allows.
 *
 * `containerWidth` is the viewport's offsetWidth — the outer width, including
 * padding and the scrollbar track. Measuring clientWidth instead is the bug:
 * it includes the scrollbar gutter when the current page is short, then loses
 * ~15 px when the fitted page gets taller and the vertical scrollbar appears,
 * which pushes a horizontal scrollbar into view. Flooring and one spare pixel
 * keep the page inside the content box in both scrollbar states.
 */
/** Scroll target that puts a page just below the top of the viewport. */
export function pageScrollTarget(offsetTop: number): number {
  return Math.max(0, offsetTop - 8);
}

/** The page whose top has passed the viewport's top gutter. */
export function currentPageFromScroll(
  pages: Iterable<readonly [number, number]>,
  scrollTop: number,
): number {
  const marker = scrollTop + 8;
  let current = 1;
  for (const [page, offsetTop] of pages) {
    if (offsetTop <= marker && page > current) current = page;
  }
  return current;
}

export function fitPercent(containerWidth: number, pageWidth: number): number | null {
  const available =
    containerWidth - VIEWPORT_PADDING - SCROLLBAR_RESERVE - 1;
  if (!(available > 0) || !(pageWidth > 0)) return null;
  return Math.floor((available / pageWidth) * 100);
}

interface PdfViewerProps {
  pdfUrl: string | null;
  revision: string;
  zoom?: number;
  darkMode?: boolean;
  onNumPages?: (numPages: number) => void;
  onPageChange?: (page: number) => void;
  onPageDoubleClick?: (page: number, x: number, y: number) => void;
  searchQuery?: string;
  pageRef?: React.MutableRefObject<PdfViewerHandle | null>;
}

function PageCanvas({
  doc,
  page,
  zoom,
}: {
  doc: PDFDocumentProxy | null;
  page: number;
  zoom: number;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let task: { cancel(): void; promise: Promise<void> } | null = null;
    void doc.getPage(page).then((pdfPage) => {
      if (cancelled || !canvasRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: zoom * dpr });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      task = pdfPage.render({ canvas, viewport });
      void task.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom]);

  return <canvas ref={canvasRef} />;
}

export function PdfViewer({
  pdfUrl,
  zoom = 1,
  darkMode = false,
  onNumPages,
  onPageChange,
  onPageDoubleClick,
  searchQuery = "",
  pageRef,
}: PdfViewerProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const [numPages, setNumPages] = useState(0);
  const [visible, setVisible] = useState<Set<number>>(new Set());
  const [generation, setGeneration] = useState(0);
  const [hits, setHits] = useState<
    Array<{ page: number; x: number; y: number; width: number; height: number }>
  >([]);
  const [flash, setFlash] = useState<{
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!pdfUrl) {
      void docRef.current?.cleanup();
      docRef.current = null;
      setNumPages(0);
      return;
    }
    let cancelled = false;
    void loadPdfDocument(pdfUrl).then((doc) => {
      if (cancelled) return;
      void docRef.current?.cleanup();
      docRef.current = doc;
      setNumPages(doc?.numPages ?? 0);
      onNumPages?.(doc?.numPages ?? 0);
      setGeneration((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  useEffect(
    () => () => {
      void docRef.current?.cleanup();
      docRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || numPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) next.add(page);
            else next.delete(page);
          }
          return next;
        });
      },
      { root: host, rootMargin: "300px" },
    );
    for (const element of pageEls.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [numPages, generation]);

  // Search: extract the text items of the visible pages and map the hits.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || searchQuery.trim() === "") {
      setHits([]);
      return;
    }
    let cancelled = false;
    const query = searchQuery.toLowerCase();
    const found: Array<{
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
    void (async () => {
      for (let page = 1; page <= doc.numPages; page += 1) {
        const pdfPage = await doc.getPage(page);
        const viewport = pdfPage.getViewport({ scale: zoom });
        const content = await pdfPage.getTextContent();
        for (const item of content.items) {
          if (!("str" in item) || !item.str.toLowerCase().includes(query))
            continue;
          const [, , , , e, f] = item.transform;
          found.push({
            page,
            x: e * zoom,
            y: viewport.height - f * zoom - item.height * zoom,
            width: item.width * zoom,
            height: item.height * zoom,
          });
        }
      }
      if (!cancelled) setHits(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, generation, zoom]);

  useEffect(() => {
    if (!pageRef) return;
    pageRef.current = {
      scrollTo: (page, _xFraction, yFraction) => {
        const element = pageEls.current.get(page);
        const host = hostRef.current;
        if (element && host) {
          const top =
            element.offsetTop + yFraction * element.offsetHeight - host.clientHeight / 2;
          host.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        }
        onPageChange?.(page);
      },
      revealLineRect: (page, rect) => {
        setFlash({ page, ...rect });
        window.setTimeout(() => setFlash(null), 900);
      },
      getPageGeometry: (page) => {
        const element = pageEls.current.get(page);
        return element
          ? { width: element.clientWidth, height: element.clientHeight }
          : null;
      },
      goToPage: (page) => {
        const element = pageEls.current.get(page);
        const host = hostRef.current;
        if (!element || !host) return;
        host.scrollTo({
          top: pageScrollTarget(element.offsetTop),
          behavior: "smooth",
        });
        onPageChange?.(page);
      },
      fitWidth: async () => {
        const doc = docRef.current;
        const host = hostRef.current;
        if (!doc || !host) return null;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        return fitPercent(host.offsetWidth, base.width);
      },
    };
    return () => {
      pageRef.current = null;
    };
  }, [pageRef, onPageChange, numPages]);

  // Manual scrolling must keep the toolbar counter in sync. The viewer
  // derives the current page from page offsets; the imperative handle above
  // only reports the destination of a programmatic jump.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || numPages === 0 || !onPageChange) return;
    let frame = 0;
    const report = () => {
      frame = 0;
      const pages = Array.from(pageEls.current, ([page, element]) => [
        page,
        element.offsetTop,
      ] as const);
      onPageChange(currentPageFromScroll(pages, host.scrollTop));
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(report);
    };
    host.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      host.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [numPages, onPageChange, generation]);

  return (
    <div
      ref={hostRef}
      data-testid="pdf-viewport"
      className="relative h-full overflow-auto bg-bg-preview p-2"
    >
      {Array.from({ length: numPages }, (_, index) => index + 1).map((page) => (
        <div
          key={page}
          data-page={page}
          ref={(element) => {
            if (element) pageEls.current.set(page, element);
            else pageEls.current.delete(page);
          }}
          style={{
            filter: darkMode ? "invert(1) hue-rotate(180deg)" : undefined,
          }}
          className="relative mx-auto mb-2 w-fit bg-white shadow-[0_1px_3px_rgb(0_0_0_/_0.3)]"
          onDoubleClick={
            onPageDoubleClick
              ? (event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onPageDoubleClick(
                    page,
                    (event.clientX - rect.left) / rect.width,
                    (event.clientY - rect.top) / rect.height,
                  );
                }
              : undefined
          }
        >
          {visible.has(page) ? (
            <PageCanvas doc={docRef.current} page={page} zoom={zoom} />
          ) : (
            <div style={{ height: 600, width: 450 }} />
          )}
          {hits
            .filter((hit) => hit.page === page)
            .map((hit, index) => (
              <div
                key={index}
                className="pointer-events-none absolute bg-[color:var(--notification-border-warning)] opacity-40"
                style={{
                  left: hit.x,
                  top: hit.y,
                  width: hit.width,
                  height: hit.height,
                }}
              />
            ))}
          {flash && flash.page === page ? (
            <div
              data-testid="pdf-line-flash"
              className="pointer-events-none absolute bg-[color:var(--bg-preview-hover-inverted)] opacity-60 transition-opacity duration-700"
              style={{
                left: flash.x,
                top: flash.y,
                width: flash.width,
                height: flash.height,
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}