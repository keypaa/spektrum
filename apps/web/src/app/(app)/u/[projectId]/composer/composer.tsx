"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  IconArrowUp,
  IconChevronDown,
  IconMic,
  IconPlus,
  IconSparkle,
  IconStop,
} from "@spektrum/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spektrum/ui";
import { THINKING, type ThinkingLevel } from "@spektrum/shared/ai"; // corrected below
import type { useChat } from "./use-chat";
import { Transcript } from "./transcript";
import type { MessagePart } from "@spektrum/shared/ai"; // corrected below

const LINE_HEIGHT = 16;
const MAX_LINES = 5;

export function Composer({
  chat,
  aiEnabled,
  onReview,
  openTabs,
  onAccept,
  onReject,
}: {
  chat: ReturnType<typeof useChat>;
  aiEnabled: boolean;
  onReview(): void;
  openTabs: string[];
  onAccept(part: Extract<MessagePart, { type: "diff" }>): void;
  onReject(part: Extract<MessagePart, { type: "diff" }>): void;
}): React.ReactElement {
  const [value, setValue] = useState("");
  const [level, setLevel] = useState<ThinkingLevel>("Medium");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const plusMenuId = useId();
  const streaming = chat.status === "streaming";
  const disabled = !aiEnabled || (!streaming && !value.trim());

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const capped = Math.min(el.scrollHeight, LINE_HEIGHT * MAX_LINES);
    el.style.height = `${capped}px`;
    el.style.overflowY =
      el.scrollHeight > LINE_HEIGHT * MAX_LINES ? "auto" : "hidden";
  }, [value]);

  const submit = (): void => {
    const text = value.trim();
    if (!text || streaming || !aiEnabled) return;
    chat.send(text, level, openTabs);
    setValue("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col justify-end px-6 pb-4">
      {chat.parts.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <Transcript
            parts={chat.parts}
            projectId=""
            threadId={chat.threadId}
            onAccept={onAccept}
            onReject={onReject}
            onRerun={chat.rerun}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          <p className="text-[13px] leading-[18px] text-text-editor-secondary">
            Ready when you are!
          </p>
          {aiEnabled ? (
            <button
              type="button"
              onClick={onReview}
              className="flex h-8 items-center gap-1 rounded-3xl bg-bg-tertiary px-3 text-xs text-text-editor-primary"
            >
              <IconSparkle size={16} />
              Review paper
            </button>
          ) : (
            <p className="text-xs text-text-editor-tertiary">
              Add your API key in Settings
            </p>
          )}
        </div>
      )}

      <div
        data-testid="composer"
        className="flex min-h-[64px] w-full flex-col rounded-3xl border border-[color:var(--ai-border)] bg-ai-bg px-4 py-3"
      >
        <textarea
          ref={areaRef}
          aria-label="Ask anything"
          placeholder="Ask anything"
          value={value}
          rows={1}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          className="w-full resize-none bg-transparent text-xs leading-4 text-text-editor-primary outline-none placeholder:text-text-editor-placeholder"
        />
        <div className="mt-2 flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Add files"
                aria-haspopup="menu"
                aria-controls={plusMenuId}
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-text-editor-secondary hover:text-text-editor-primary"
              >
                <IconPlus size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              id={plusMenuId}
              side="top"
              align="start"
              className="min-w-[220px]"
            >
              <DropdownMenuItem disabled className="flex-col items-start gap-0.5">
                <span>Upload files &amp; photos</span>
                <span className="text-xs text-text-editor-tertiary">
                  Add files, review your paper, and more
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Thinking: ${level}`}
                className="flex h-7 items-center gap-1 rounded-full px-2 text-xs text-text-editor-secondary hover:text-text-editor-primary"
              >
                <span>{`Thinking: ${level}`}</span>
                <IconChevronDown size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="min-w-[160px]">
              {(Object.keys(THINKING) as ThinkingLevel[]).map((entry) => (
                <DropdownMenuItem key={entry} onSelect={() => setLevel(entry)}>
                  {entry}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            aria-label="Voice mode"
            aria-disabled="true"
            className="flex h-7 w-7 flex-none cursor-not-allowed items-center justify-center rounded-full text-text-editor-secondary opacity-50"
          >
            <IconMic size={16} />
          </button>

          <button
            type="button"
            aria-label={streaming ? "Stop" : "Send"}
            aria-disabled={disabled}
            onClick={streaming ? chat.stop : submit}
            className="ml-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[color:var(--button-primary-bg)] text-[color:var(--button-primary-text)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
          >
            {streaming ? <IconStop size={16} /> : <IconArrowUp size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}