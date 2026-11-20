"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconCopy } from "@spektrum/ui/icons";

/** Small copy affordance used on chat messages and reasoning blocks. */
export function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={(event) => {
        // A copy button inside a <summary> must not expand/collapse it.
        event.preventDefault();
        event.stopPropagation();
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => undefined);
      }}
      className={`flex h-7 w-7 flex-none items-center justify-center rounded-md border border-[color:var(--border-outline)] text-text-editor-secondary transition-colors hover:bg-nav-bg-hover hover:text-text-editor-primary ${className}`}
    >
      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
    </button>
  );
}
