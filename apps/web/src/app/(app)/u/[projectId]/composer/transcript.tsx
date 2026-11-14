"use client";

import type { MessagePart } from "@spektrum/shared/ai";

export function Transcript({
  parts,
  onAccept,
  onReject,
  onRerun,
}: {
  parts: MessagePart[];
  projectId: string;
  threadId: string | null;
  onAccept(part: Extract<MessagePart, { type: "diff" }>): void;
  onReject(part: Extract<MessagePart, { type: "diff" }>): void;
  onRerun(part: MessagePart): void;
}): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-1 py-2">
      {parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <p key={index} className="whitespace-pre-wrap text-xs leading-4">
              {part.text}
            </p>
          );
        }
        if (part.type === "thinking") {
          return (
            <details key={index} className="text-xs text-text-editor-secondary">
              <summary>Thinking</summary>
              <p className="whitespace-pre-wrap">{part.text}</p>
            </details>
          );
        }
        if (part.type === "tool_call") {
          return (
            <p key={index} className="text-xs text-text-editor-tertiary">
              {part.name}
            </p>
          );
        }
        if (part.type === "tool_result") {
          return (
            <p key={index} className="text-xs text-text-editor-tertiary">
              {part.summary}
            </p>
          );
        }
        return (
          <div
            key={index}
            data-testid="diff-card"
            className="rounded-xl border border-[color:var(--border-log)] p-2"
          >
            <p className="text-xs">
              {part.proposal.path} · {part.proposal.kind}
            </p>
            {part.status === "pending" ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="h-7 rounded-full bg-[color:var(--button-primary-bg)] px-3 text-xs text-[color:var(--button-primary-text)]"
                  onClick={() => onAccept(part)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="h-7 rounded-full border border-[color:var(--border-log)] px-3 text-xs"
                  onClick={() => onReject(part)}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="h-7 rounded-full px-2 text-xs text-text-editor-tertiary"
                  onClick={() => onRerun(part)}
                >
                  Re-run
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-text-editor-tertiary">
                {part.status}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}