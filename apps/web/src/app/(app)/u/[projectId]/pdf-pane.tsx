import {
  IconArrowRight,
  IconChevronDown,
  IconRedo,
  IconSpinner,
  IconUndo,
} from "@spektrum/ui/icons";

// The static pre-compile PDF pane (spec §8.1; measured in
// zenno/recon/extracted/editor-ui.md §1.7). Phase 2 renders exactly the captured
// state: a bg-code pane with 8 px top/bottom padding, a bg-preview sheet with
// rounded top corners, the compile pill (topbar), the centred `Initializing...`
// placeholder and the floating panel toolbar.
//
// Phase 3 replaces the sheet's contents with the real PDF viewer; this file is
// the mount point. Everything here is inert.

function InertButton({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled="true"
      className={`flex items-center justify-center text-tools-fg ${className}`}
    >
      {children}
    </button>
  );
}

export function PdfPane() {
  return (
    <div
      data-testid="pdf-pane"
      className="flex h-full min-h-0 flex-col bg-bg-code pb-2 pt-2"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-t-lg bg-bg-preview">
        {/* PDF topbar — only the compile pill renders pre-compile (bundle
            `056lqy1-luum3.js` @113182: page controls/zoom/download are
            numPages-gated). */}
        <div className="flex w-full items-center bg-transparent px-2 pb-2 pt-2">
          <div className="inline-flex min-w-0 shrink-0 items-center overflow-hidden rounded-full border border-[color:var(--border-preview)]">
            <InertButton
              label="Initializing..."
              className="h-9 max-w-[200px] gap-2 px-3"
            >
              <IconSpinner size={16} className="shrink-0 animate-spin" />
              <span className="truncate whitespace-nowrap text-sm">Initializing...</span>
            </InertButton>
            <InertButton
              label="Realtime compilation"
              className="h-9 w-7 border-l border-[color:var(--border-preview)]"
            >
              <IconChevronDown size={14} />
            </InertButton>
          </div>
        </div>

        {/* Centred loading placeholder (bundle @113308). */}
        <div className="flex h-full w-full grow items-center justify-center gap-3 p-8">
          <IconSpinner size={16} className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span className="text-xs font-medium text-[color:var(--text-editor-quaternary)]">
            Initializing...
          </span>
        </div>

        {/* Floating panel toolbar (CrixetPDFPanelToolbar, bundle @52600):
            [undo][redo] [goto-file] Go to PDF [arrow]. */}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-row items-center justify-between gap-1 rounded-full bg-ai-bg px-3 py-2 shadow-[0_7px_24px_rgba(0,0,0,0.25)]">
          <InertButton label="Undo" className="rounded-l-xl px-1.5 py-1.5">
            <IconUndo size={18} />
          </InertButton>
          <InertButton label="Redo" className="px-1.5 py-1.5">
            <IconRedo size={18} />
          </InertButton>
          <InertButton label="Go to file" className="rounded-l-xl p-1">
            <IconFileSearchGlyph />
          </InertButton>
          <InertButton label="Go to PDF" className="gap-1 rounded-r-xl px-2 py-1">
            <span className="whitespace-nowrap text-xs font-medium">Go to PDF</span>
            <IconArrowRight size={20} />
          </InertButton>
        </div>
      </div>
    </div>
  );
}

// The bundle's goto-file glyph is a file with a corner arrow (f.default,
// 20 px). Drawn here rather than added to the registry: it is used exactly once
// and only by this inert bar.
function IconFileSearchGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 2.5h5l3 3v6.5a1 1 0 0 1-1 1H7.5" />
      <path d="M9 2.5v3h3" />
      <path d="M11.5 12.5v-3M10 11l1.5-1.5L13 11" />
    </svg>
  );
}