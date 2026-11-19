"use client";

// Shown in the PDF pane when the last compile failed. Without it the only
// signals were the pill switching from "Compiled" to "Failed" and the log text
// buried behind Tools → Logs, so a failed compile looked like a stale PDF.
import type { Diagnostic } from "@spektrum/shared";

export interface CompileErrorBannerProps {
  /** The most severe diagnostic from the failed render, if any. */
  diagnostic: Diagnostic | null;
  onOpenLogs: () => void;
}

export function CompileErrorBanner({
  diagnostic,
  onOpenLogs,
}: CompileErrorBannerProps): React.ReactElement | null {
  if (!diagnostic) return null;
  const where = diagnostic.file
    ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line + 1}` : ""}`
    : null;

  return (
    <div
      data-testid="compile-error"
      role="alert"
      className="flex items-start gap-2 rounded-t-lg border-b border-[color:var(--notification-border-error)] bg-notification-bg px-3 py-2 text-xs text-fg-error"
    >
      <span className="min-w-0 flex-1">
        <span className="font-medium">Compile failed</span>
        {diagnostic.message ? ` — ${diagnostic.message}` : ""}
        {where ? (
          <span className="ml-2 text-fg-tertiary">{where}</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onOpenLogs}
        className="flex-none rounded-full border border-[color:var(--notification-border-error)] px-2 py-0.5 hover:bg-[color:var(--bg-preview-hover)]"
      >
        View log
      </button>
    </div>
  );
}
