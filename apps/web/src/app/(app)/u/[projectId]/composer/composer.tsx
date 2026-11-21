"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  IconArrowUp,
  IconChevronDown,
  IconClose,
  IconMic,
  IconPaperclip,
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
import type { DocumentSummary } from "@/lib/documents";
import type { useChat } from "./use-chat";
import { Transcript } from "./transcript";
import type { MessagePart } from "@spektrum/shared/ai"; // corrected below

const LINE_HEIGHT = 16;
const MAX_LINES = 5;

export function Composer({
  chat,
  aiEnabled,
  onReview,
  onUploadFiles,
  onReviewDiff,
  documents = [],
  selection = null,
  onClearSelection = () => undefined,
  onNavigateToSelection = () => undefined,
  beforeSend,
}: {
  chat: ReturnType<typeof useChat>;
  aiEnabled: boolean;
  onReview(): void;
  onUploadFiles(files: File[]): void;
  onReviewDiff(part: Extract<MessagePart, { type: "diff" }>): void;
  documents?: DocumentSummary[];
  selection?: { path: string; startLine: number; endLine: number } | null;
  onClearSelection?(): void;
  onNavigateToSelection?(range: {
    path: string;
    startLine: number;
    endLine: number;
  }): void;
  beforeSend?(): Promise<void>;
}): React.ReactElement {
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [pinnedPaths, setPinnedPaths] = useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [level, setLevel] = useState<ThinkingLevel>("Extra high");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const plusMenuId = useId();
  const streaming = chat.status === "streaming";
  const disabled = !aiEnabled || (!streaming && !value.trim());

  const mentionQuery =
    /(?:^|\s)@([^\s@]*)$/.exec(value.slice(0, caret))?.[1] ?? null;
  const mentionMatches =
    mentionQuery === null
      ? []
      : documents
          .filter((doc) => doc.path.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 50);

  const chooseMention = (path: string): void => {
    const before = value.slice(0, caret);
    const match = /(^|\s)@[^\s@]*$/.exec(before);
    if (match) {
      const start = before.length - match[0].length + (match[1] ? 1 : 0);
      setValue(value.slice(0, start) + value.slice(caret));
      setCaret(start);
    }
    setPinnedPaths((current) =>
      current.includes(path) ? current : [...current, path],
    );
    setMentionOpen(false);
    setMentionIndex(0);
    areaRef.current?.focus();
  };

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const capped = Math.min(el.scrollHeight, LINE_HEIGHT * MAX_LINES);
    el.style.height = `${capped}px`;
    el.style.overflowY =
      el.scrollHeight > LINE_HEIGHT * MAX_LINES ? "auto" : "hidden";
  }, [value]);

  // Guard against a double submit (a fast double click or a click retried by
  // the harness) before the streaming state has re-rendered.
  const sending = useRef(false);
  useEffect(() => {
    if (!streaming) sending.current = false;
  }, [streaming]);

  const submit = async (): Promise<void> => {
    const text = value.trim();
    if (!text || streaming || !aiEnabled || sending.current) return;
    sending.current = true;
    // Capture before clearing: parent state updates are asynchronous.
    const captured = selection;
    await beforeSend?.();
    chat.send(text, level, pinnedPaths, undefined, captured ?? undefined);
    setValue("");
    setCaret(0);
    setPinnedPaths([]);
    setMentionOpen(false);
    onClearSelection();
  };

  return (
    <div className="flex h-full min-h-0 flex-col justify-end px-6 pb-4">
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        aria-label="Choose files to upload"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onUploadFiles(files);
          event.target.value = "";
        }}
      />
      {chat.parts.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <Transcript
            parts={chat.parts}
            onReviewDiff={onReviewDiff}
            streaming={streaming}
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

      {chat.error ? (
        <div
          role="alert"
          className="mb-2 flex-none rounded-xl border border-[color:var(--border-log)] bg-bg-app px-3 py-2 text-xs text-fg-error"
        >
          {chat.error}
        </div>
      ) : null}

      <div
        data-testid="composer"
        className="relative flex min-h-[64px] w-full flex-none flex-col rounded-3xl border border-[color:var(--ai-border)] bg-ai-bg px-4 py-3"
      >
        {pinnedPaths.length > 0 || selection ? (
          <div className="mb-2 flex flex-wrap gap-1">
            {pinnedPaths.map((path) => (
              <span
                key={path}
                data-testid="pinned-file-chip"
                className="flex items-center gap-1 rounded-full bg-bg-tertiary px-2 py-1 text-xs text-text-editor-primary"
              >
                {path}
                <button
                  type="button"
                  aria-label={`Remove ${path}`}
                  onClick={() =>
                    setPinnedPaths((current) => current.filter((p) => p !== path))
                  }
                  className="text-text-editor-tertiary hover:text-text-editor-primary"
                >
                  <IconClose size={12} />
                </button>
              </span>
            ))}
            {selection ? (
              <span
                data-testid="selection-chip"
                className="flex items-center gap-1 rounded-full bg-bg-tertiary px-2 py-1 text-xs text-text-editor-primary"
              >
                <button
                  type="button"
                  onClick={() => onNavigateToSelection(selection)}
                  className="hover:underline"
                >
                  {selection.path} {selection.startLine}-{selection.endLine}
                </button>
                <button
                  type="button"
                  aria-label="Remove selection"
                  onClick={onClearSelection}
                  className="text-text-editor-tertiary hover:text-text-editor-primary"
                >
                  <IconClose size={12} />
                </button>
              </span>
            ) : null}
          </div>
        ) : null}

        <textarea
          ref={areaRef}
          aria-label="Ask anything"
          placeholder="Ask anything"
          value={value}
          rows={1}
          onChange={(event) => {
            setValue(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
            setMentionOpen(
              /(?:^|\s)@([^\s@]*)$/.test(
                event.target.value.slice(0, event.target.selectionStart ?? event.target.value.length),
              ),
            );
            setMentionIndex(0);
          }}
          onKeyDown={(event) => {
            if (mentionOpen && mentionMatches.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setMentionIndex((index) => (index + 1) % mentionMatches.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setMentionIndex(
                  (index) => (index - 1 + mentionMatches.length) % mentionMatches.length,
                );
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                chooseMention(mentionMatches[mentionIndex]!.path);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setMentionOpen(false);
                return;
              }
            }
            if (event.key === "Backspace" && value.length === 0) {
              event.preventDefault();
              if (selection) onClearSelection();
              else if (pinnedPaths.length > 0)
                setPinnedPaths((current) => current.slice(0, -1));
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          className="w-full resize-none bg-transparent text-xs leading-4 text-text-editor-primary outline-none placeholder:text-text-editor-placeholder"
        />
        {mentionOpen && mentionMatches.length > 0 ? (
          <div
            role="listbox"
            aria-label="Workspace files"
            className="absolute bottom-16 left-6 z-20 max-h-52 w-72 overflow-y-auto rounded-xl border border-[color:var(--border-outline)] bg-bg-app p-1 shadow-menu"
          >
            {mentionMatches.map((doc, index) => (
              <button
                key={doc.id}
                type="button"
                role="option"
                aria-selected={index === mentionIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseMention(doc.path);
                }}
                className={`block w-full truncate rounded-lg px-2 py-1 text-left text-xs ${
                  index === mentionIndex
                    ? "bg-nav-bg-hover text-text-editor-primary"
                    : "text-text-editor-secondary"
                }`}
              >
                {doc.path}
              </button>
            ))}
          </div>
        ) : null}
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
              <DropdownMenuItem
                onSelect={() => uploadInputRef.current?.click()}
                className="flex-col items-start gap-0.5"
              >
                <span className="flex items-center gap-2">
                  <IconPaperclip size={16} />
                  Upload files &amp; photos
                </span>
                <span className="text-xs text-text-editor-tertiary">
                  Add files to this project&apos;s workspace
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