"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  IconArrowUp,
  IconChevronDown,
  IconMic,
  IconPlus,
} from "@spektrum/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spektrum/ui";

export type ThinkingLevel = "Minimal" | "Low" | "Medium" | "High" | "Extra high";

const LEVELS: readonly ThinkingLevel[] = [
  "Minimal",
  "Low",
  "Medium",
  "High",
  "Extra high",
];

const LINE_HEIGHT = 16; // text-xs leading-4
const MAX_LINES = 5;

/**
 * The composer shell (spec §6.4). Phase 2 is inert: the textarea autogrows,
 * the thinking menu switches a local level, and every action is disabled
// (D32: the placeholder is `Getting ready...`). Phase 4 wires the send path.
 */
export function Composer() {
  const [value, setValue] = useState("");
  const [level, setLevel] = useState<ThinkingLevel>("Medium");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Autogrow: reset the height, then clamp to five lines.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const capped = Math.min(el.scrollHeight, LINE_HEIGHT * MAX_LINES);
    el.style.height = `${capped}px`;
    el.style.overflowY = el.scrollHeight > LINE_HEIGHT * MAX_LINES ? "auto" : "hidden";
  }, [value]);

  const plusMenuId = useId();

  return (
    <div className="flex h-full min-h-0 flex-col justify-end px-6 pb-4">
      <div
        data-testid="composer"
        className="flex min-h-[64px] w-full flex-col rounded-3xl border border-[color:var(--ai-border)] bg-ai-bg px-4 py-3"
      >
        <textarea
          ref={areaRef}
          aria-label="Ask anything"
          placeholder="Getting ready..."
          value={value}
          rows={1}
          onChange={(e) => setValue(e.target.value)}
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
            <DropdownMenuContent id={plusMenuId} side="top" align="start" className="min-w-[220px]">
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
              {LEVELS.map((l) => (
                <DropdownMenuItem key={l} onSelect={() => setLevel(l)}>
                  {l}
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
            aria-label="Send"
            aria-disabled="true"
            className="ml-1 flex h-7 w-7 flex-none cursor-not-allowed items-center justify-center rounded-full bg-[color:var(--button-primary-bg)] text-[color:var(--button-primary-text)] opacity-50"
          >
            <IconArrowUp size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}