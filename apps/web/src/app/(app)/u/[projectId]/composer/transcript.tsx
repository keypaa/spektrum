"use client";

import { useEffect, useRef } from "react";
import type { MessagePart } from "@spektrum/shared/ai";
import { CopyButton } from "@/components/chat/copy-button";
import { MarkdownContent } from "@/components/chat/markdown-content";
import { isUserTextPart } from "./chat-parts";

export function Transcript({
  parts,
  onReviewDiff,
  streaming = false,
}: {
  parts: MessagePart[];
  onReviewDiff(part: Extract<MessagePart, { type: "diff" }>): void;
  streaming?: boolean;
}): React.ReactElement {
  // Older stored replies contain one "Thinking" part per token chunk, and a
  // threaded reload can append the just-streamed reply again. Collapse both
  // before rendering so a single reply reads as a single block.
  const visible: MessagePart[] = [];
  for (const part of parts) {
    const last = visible.at(-1);
    // A model retrying the same edit emits identical tool parts. Showing each
    // attempt filled the transcript with duplicates of the same failure.
    if (part.type === "tool_call") {
      const previousCall = [...visible]
        .reverse()
        .find((candidate) => candidate.type === "tool_call");
      if (
        previousCall?.type === "tool_call" &&
        previousCall.name === part.name &&
        JSON.stringify(previousCall.args) === JSON.stringify(part.args)
      ) {
        continue;
      }
    }
    if (
      part.type === "tool_result" &&
      last?.type === "tool_result" &&
      last.ok === part.ok &&
      last.summary === part.summary
    ) {
      continue;
    }
    if (part.type === "thinking" && last?.type === "thinking") {
      visible[visible.length - 1] = { ...last, text: last.text + part.text };
    } else if (
      part.type === "text" &&
      last?.type === "text" &&
      // A user turn and an assistant reply are both plain text parts. Merging
      // across that boundary made the follow-up disappear into the previous
      // answer.
      isUserTextPart(last) === isUserTextPart(part)
    ) {
      // Legacy replies were persisted as many small text parts (and a reload
      // can duplicate one). Render them as one message with one copy button.
      const text = part.text === last.text ? last.text : `${last.text}\n${part.text}`;
      visible[visible.length - 1] = { ...last, text };
    } else {
      visible.push(part);
    }
  }
  const rendered = visible.filter(
    (part) => part.type !== "thinking" || part.text.trim().length > 0,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const last = rendered.at(-1);
  const lastText = last?.type === "text" ? last.text : "";
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [rendered.length, lastText, streaming]);

  return (
    <div
      ref={scrollRef}
      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-1 py-2"
    >
      {rendered.map((part, index) => {
        if (part.type === "text") {
          const isUser = part.text.startsWith("User: ");
          const text = isUser ? part.text.slice("User: ".length) : part.text;
          const mentions = text.match(/@[^\s@]+/g) ?? [];
          const body = mentions.length
            ? text.replace(/@[^\s@]+/g, "").replace(/\s+/g, " ").trim()
            : text;
          return isUser ? (
            <div key={index} className="flex flex-col items-end gap-1">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-bg-tertiary px-3 py-2 text-xs leading-4 text-text-editor-primary">
                {mentions.length ? (
                  <div className="mb-1 flex flex-wrap justify-end gap-1">
                    {mentions.map((mention, mentionIndex) => (
                      <span
                        key={mentionIndex}
                        data-testid="user-mention"
                        className="rounded-full bg-bg-app px-2 py-0.5 text-[11px] text-text-editor-secondary"
                      >
                        {mention}
                      </span>
                    ))}
                  </div>
                ) : null}
                {body}
              </div>
              <CopyButton text={text} label="Copy message" />
            </div>
          ) : (
            <div key={index} className="flex flex-col items-start gap-1">
              <MarkdownContent content={text} />
              <CopyButton text={text} label="Copy reply" />
            </div>
          );
        }
        if (part.type === "thinking") {
          return (
            <details
              key={index}
              className="rounded-xl border border-[color:var(--border-log)] p-2 text-xs"
            >
              <summary className="flex cursor-pointer list-none items-center text-text-editor-secondary">
                Thinking
              </summary>
              <div className="mt-2 whitespace-pre-wrap text-text-editor-tertiary">
                {part.text}
              </div>
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
              <button
                type="button"
                onClick={() => onReviewDiff(part)}
                className="mt-2 h-7 rounded-full border border-[color:var(--border-log)] px-3 text-xs"
              >
                Review
              </button>
            ) : (
              <p className="mt-1 text-xs text-text-editor-tertiary">{part.status}</p>
            )}
          </div>
        );
      })}
      {streaming ? (
        <div className="flex items-center gap-2 text-xs text-[color:var(--border-brand)]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
          Thinking...
        </div>
      ) : null}
    </div>
  );
}
