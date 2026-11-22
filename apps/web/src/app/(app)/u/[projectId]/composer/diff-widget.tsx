"use client";

// The inline diff review (spec §7.4). A Monaco diff editor overlays the editor
// area (rendered by the editor client, not the scrolling transcript), with the
// current document as the original model and the proposal as the modified one.
// Accept applies the proposal through the parent (the server never writes
// content), then the decision is PATCHed back so the persisted part carries it.

import { useEffect, useRef, useState } from "react";
import type { DiffPart } from "./diff-accept";

export interface DiffWidgetProps {
  part: DiffPart;
  /** The current content of the proposal's document (the original side). */
  original: string;
  projectId: string;
  threadId: string | null;
  theme?: "crixet" | "crixet-light";
  stale?: boolean;
  busy?: boolean;
  onAccept(part: DiffPart): Promise<{ ok: true } | { ok: false; error: string }>;
  onReject(part: DiffPart): Promise<void>;
  onRerun(part: DiffPart): void;
  onStatus(part: DiffPart, status: "accepted" | "rejected"): void;
  onAcceptAll?(): void;
}

export function DiffWidget({
  part,
  original,
  projectId,
  threadId,
  theme = "crixet",
  stale = false,
  busy = false,
  onAccept,
  onReject,
  onRerun,
  onStatus,
  onAcceptAll,
}: DiffWidgetProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    // On demand, not at module scope: `monaco-editor` touches `window` while it
    // loads, and a Client Component is still prerendered on the server. A static
    // import therefore crashed the production build's SSR pass with
    // "ReferenceError: window is not defined" — the editor route answered 500 —
    // while `next dev` never evaluated it eagerly and hid the bug. This is the
    // documented pattern for client-only libraries (Next docs, lazy-loading,
    // "Loading External Libraries").
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void import("@/editor/monaco-environment")
      .then(({ monaco, setupMonacoEnvironment }) => {
        if (disposed) return;
        setupMonacoEnvironment();
        const originalModel = monaco.editor.createModel(
          original,
          "latex",
          monaco.Uri.parse(`inmemory://spektrum-diff/original/${part.id}`),
        );
        const modifiedModel = monaco.editor.createModel(
          part.proposal.proposedContent,
          "latex",
          monaco.Uri.parse(`inmemory://spektrum-diff/modified/${part.id}`),
        );
        const diff = monaco.editor.createDiffEditor(el, {
          readOnly: true,
          theme,
          automaticLayout: true,
          renderSideBySide: true,
          originalEditable: false,
        });
        diff.setModel({ original: originalModel, modified: modifiedModel });
        cleanup = () => {
          diff.dispose();
          originalModel.dispose();
          modifiedModel.dispose();
        };
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [part.id, part.proposal.proposedContent, original, theme]);

  const patch = async (decision: "accepted" | "rejected"): Promise<void> => {
    if (!threadId) return;
    const response = await fetch(
      `/api/projects/${projectId}/threads/${threadId}/messages/${part.messageId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ diffId: part.id, decision }),
      },
    );
    if (response.ok) onStatus(part, decision);
  };

  const accept = async (): Promise<void> => {
    if (working || busy) return;
    setWorking(true);
    setError(null);
    try {
      const result = await onAccept(part);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await patch("accepted");
    } finally {
      setWorking(false);
    }
  };

  const reject = async (): Promise<void> => {
    if (working || busy) return;
    setWorking(true);
    setError(null);
    try {
      await onReject(part);
      await patch("rejected");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div
      data-testid="diff-widget"
      className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-3xl bg-[color:var(--modal-bg)]"
    >
      <div ref={hostRef} data-testid="diff-editor" className="min-h-0 flex-1" />
      {error ? (
        <p role="alert" className="px-4 pb-1 text-xs text-fg-error">
          {error}
        </p>
      ) : null}
      <div className="m-3 flex min-h-[30px] flex-wrap items-center gap-2 self-center rounded-3xl border border-[color:var(--border-log)] bg-bg-app px-2 py-0.5">
        {stale ? (
          <>
            <span className="text-xs text-text-editor-secondary">
              The document changed since this suggestion — re-run?
            </span>
            <button
              type="button"
              onClick={() => onRerun(part)}
              className="h-7 rounded-full bg-[color:var(--button-primary-bg)] px-3 text-xs text-[color:var(--button-primary-text)]"
            >
              Re-run
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void reject()}
              disabled={busy || working}
              className="h-7 rounded-full px-3 text-xs disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => void accept()}
              disabled={busy || working}
              className="h-7 rounded-full bg-[color:var(--button-primary-bg)] px-3 text-xs text-[color:var(--button-primary-text)] disabled:opacity-50"
            >
              Accept
            </button>
            {onAcceptAll ? (
              <button
                type="button"
                onClick={onAcceptAll}
                disabled={busy || working}
                className="h-7 rounded-full px-3 text-xs text-text-editor-secondary disabled:opacity-50"
              >
                Accept all
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}