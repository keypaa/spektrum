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
}

interface PdfViewerProps {
  pdfUrl: string | null;
  revision: string;
  zoom?: number;
  darkMode?: boolean;
  onNumPages?: (numPages: number) => void;
  onPageChange?: (page: number) => void;
  onPageDoubleClick?: (page: number, x: number, y: number) => void;
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
  pageRef,
}: PdfViewerProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const [numPages, setNumPages] = useState(0);
  const [visible, setVisible] = useState<Set<number>>(new Set());
  const [generation, setGeneration] = useState(0);

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

  useEffect(() => {
    if (!pageRef) return;
    pageRef.current = {
      scrollTo: (page) => {
        pageEls.current.get(page)?.scrollIntoView({ block: "start" });
        onPageChange?.(page);
      },
      revealLineRect: () => undefined,
      getPageGeometry: (page) => {
        const element = pageEls.current.get(page);
        return element
          ? { width: element.clientWidth, height: element.clientHeight }
          : null;
      },
    };
    return () => {
      pageRef.current = null;
    };
  }, [pageRef, onPageChange, numPages]);

  return (
    <div
      ref={hostRef}
      data-testid="pdf-viewport"
      className="h-full overflow-auto bg-bg-preview p-2"
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
          className="mx-auto mb-2 w-fit bg-white shadow-[0_1px_3px_rgb(0_0_0_/_0.3)]"
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
        </div>
      ))}
    </div>
  );
}