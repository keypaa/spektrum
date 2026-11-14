"use client";

// The PDF header card and floating bar (spec §8.1). Presentational: the page
// count, zoom and render state come from the parent; every control is an
// `aria-label`led button or input.

import { useEffect, useRef, useState } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconDownload,
  IconError,
  IconFit,
  IconMoreHorizontal,
  IconRefresh,
  IconSearch,
  IconSpinner,
} from "@spektrum/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spektrum/ui";
import type { RenderEvent } from "@spektrum/shared/compile";

export type PillState =
  | "initializing"
  | "compiling"
  | "compiled"
  | "failed"
  | "dirty";

export function pillState(args: {
  render: RenderEvent | null;
  isCurrent: boolean;
  dirty: boolean;
}): PillState {
  if (args.dirty) return "dirty";
  if (!args.render) return "initializing";
  if (args.render.event === "status") {
    if (args.render.state === "queued" || args.render.state === "running")
      return "compiling";
    if (args.render.state === "error") return "failed";
    if (args.render.state === "superseded") return "compiling";
  }
  if (args.render.event === "result") return "compiled";
  return "compiled";
}

const PILL_COPY: Record<PillState, string> = {
  initializing: "Initializing...",
  compiling: "Compiling…",
  compiled: "Compiled",
  failed: "Failed",
  dirty: "Unsaved changes",
};

const ZOOM_STEPS = [50, 75, 100, 150, 200, 300, 400] as const;

export interface PdfChromeProps {
  state: PillState;
  page: number;
  numPages: number;
  zoom: number;
  onPage: (page: number) => void;
  onZoom: (zoom: number) => void;
  onRefresh: () => void;
  onGoToPdf: () => void;
  onSearch: () => void;
  pdfUrl: string | null;
  mainFile: string | null;
  durationMs: number | null;
  isCurrent: boolean;
  revision: string | null;
  darkMode: boolean;
  zoomShortcuts: boolean;
}

export function PdfChrome({
  state,
  page,
  numPages,
  zoom,
  onPage,
  onZoom,
  onRefresh,
  onGoToPdf,
  onSearch,
  pdfUrl,
  mainFile,
  durationMs,
  isCurrent,
  revision,
  darkMode,
  zoomShortcuts,
}: PdfChromeProps): React.ReactElement {
  const [barVisible, setBarVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = (): void => {
      setBarVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setBarVisible(false), 2000);
    };
    show();
    window.addEventListener("pointermove", show);
    return () => {
      window.removeEventListener("pointermove", show);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const zoomBy = (factor: number): void => {
    onZoom(Math.min(400, Math.max(50, Math.round(zoom * factor))));
  };

  useEffect(() => {
    if (!zoomShortcuts) return;
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === "0") {
        event.preventDefault();
        onZoom(100);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomBy(1.2);
      } else if (event.key === "-") {
        event.preventDefault();
        zoomBy(1 / 1.2);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pillIcon =
    state === "compiled" ? (
      <IconCheck size={16} />
    ) : state === "failed" ? (
      <IconError size={16} />
    ) : state === "compiling" ? (
      <IconSpinner size={16} className="animate-spin" />
    ) : null;

  return (
    <>
      <div className="flex w-full items-center gap-2 bg-transparent px-2 pb-2 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="pdf-pill"
              aria-label={PILL_COPY[state]}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--border-preview)] px-3 text-sm"
            >
              {pillIcon}
              <span className="whitespace-nowrap">{PILL_COPY[state]}</span>
              <IconChevronDown size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-[280px]">
            <DropdownMenuItem disabled>
              {mainFile ? `Main file: ${mainFile}` : "No render yet"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              {durationMs !== null ? `Last compile: ${durationMs} ms` : "—"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              {isCurrent ? "Matches the current revision" : "Older revision"}
            </DropdownMenuItem>
            {revision ? (
              <DropdownMenuItem disabled>{revision.slice(0, 12)}</DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex h-9 items-center rounded-full border border-[color:var(--border-preview)] px-2 text-sm">
          <input
            aria-label="Page"
            type="number"
            min={1}
            max={Math.max(1, numPages)}
            value={page}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next))
                onPage(Math.min(Math.max(1, next), Math.max(1, numPages)));
            }}
            className="w-8 bg-transparent text-center"
          />
          <span className="px-1 text-fg-tertiary">of {numPages || "—"}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="pdf-zoom"
              aria-label="Zoom"
              className="flex h-9 items-center gap-1 rounded-full border border-[color:var(--border-preview)] px2 px-3 text-sm"
            >
              <IconFit size={14} />
              <span>{zoom} %</span>
              <IconChevronDown size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => onZoom(100)}>
              Zoom to fit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => zoomBy(1.2)}>
              Zoom in
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => zoomBy(1 / 1.2)}>
              Zoom out
            </DropdownMenuItem>
            {ZOOM_STEPS.map((step) => (
              <DropdownMenuItem key={step} onSelect={() => onZoom(step)}>
                {step} %
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          aria-label="Search"
          onClick={onSearch}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border-preview)]"
        >
          <IconSearch size={16} />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border-preview)]"
            >
              <IconMoreHorizontal size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                void document.documentElement.requestFullscreen?.();
              }}
            >
              Fullscreen
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (pdfUrl) window.open(pdfUrl, "_blank", "noopener");
              }}
            >
              Open in new window
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Show screen reader mode</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {pdfUrl ? (
          <a
            href={pdfUrl}
            download
            aria-label="Download"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border-preview)]"
          >
            <IconDownload size={16} />
          </a>
        ) : null}
      </div>

      {barVisible ? (
        <div
          data-testid="pdf-floating-bar"
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-3xl bg-bg-primary px-2 py-1 shadow-[var(--shadow-surface)]"
        >
          <button
            type="button"
            aria-label="Refresh"
            onClick={onRefresh}
            className="flex h-8 w-8 items-center justify-center"
          >
            <IconRefresh size={16} />
          </button>
          <button
            type="button"
            aria-label="Go to PDF"
            onClick={onGoToPdf}
            className="flex h-8 items-center gap-1 px-2 text-xs"
          >
            Go to PDF
          </button>
        </div>
      ) : null}
      {darkMode ? <span hidden data-pdf-dark-mode /> : null}
    </>
  );
}