"use client";

// The Logs tab (spec §9.4): filter menu, diagnostic cards, Raw logs, and a
// disabled `Fix with AI` per entry (Phase 4).

import { useMemo, useState } from "react";
import { IconError, IconWarning } from "@spektrum/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spektrum/ui";
import type { Diagnostic } from "@spektrum/shared/compile";

type Filter = "all" | "warnings" | "errors" | "raw";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Warnings and Errors" },
  { value: "warnings", label: "Warnings only" },
  { value: "errors", label: "Errors only" },
  { value: "raw", label: "Raw logs" },
];

export interface LogsProps {
  diagnostics: Diagnostic[];
  log: string | null;
  onJump: (diagnostic: Diagnostic) => void;
}

export function Logs({
  diagnostics,
  log,
  onJump,
}: LogsProps): React.ReactElement {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "warnings")
      return diagnostics.filter((d) => d.severity === "warning");
    if (filter === "errors")
      return diagnostics.filter((d) => d.severity === "error");
    return diagnostics;
  }, [diagnostics, filter]);

  if (filter === "raw") {
    return (
      <pre
        data-testid="logs-raw"
        className="m-2 overflow-auto rounded-lg bg-bg-code p-2 font-mono text-xs"
      >
        {log ?? ""}
      </pre>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Logs filter"
              className="h-8 rounded-md border border-[color:var(--border-log)] bg-transparent px-2 text-sm"
            >
              {FILTERS.find((entry) => entry.value === filter)?.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {FILTERS.map((entry) => (
              <DropdownMenuItem
                key={entry.value}
                onSelect={() => setFilter(entry.value)}
              >
                {entry.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          disabled
          aria-disabled="true"
          className="ml-auto h-8 rounded-full border border-[color:var(--border-log)] px-3 text-xs text-fg-tertiary"
        >
          Fix all with AI
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="p-4 text-sm text-fg-tertiary">No errors or warnings</p>
      ) : (
        filtered.map((diagnostic, index) => (
          <button
            key={`${diagnostic.message}-${diagnostic.line ?? index}`}
            type="button"
            onClick={() => onJump(diagnostic)}
            className="flex flex-col gap-1 rounded-lg border border-[color:var(--border-log)] bg-bg-log p-2 text-left"
          >
            <span className="flex items-center gap-2 text-sm">
              {diagnostic.severity === "error" ? (
                <IconError size={16} />
              ) : (
                <IconWarning size={16} />
              )}
              <span>{diagnostic.message}</span>
              <span className="ml-auto text-xs text-fg-tertiary">
                Fix with AI
              </span>
            </span>
            {diagnostic.file ? (
              <span className="text-xs text-fg-tertiary">
                {diagnostic.file}
                {diagnostic.line !== undefined ? `:${diagnostic.line + 1}` : ""}
              </span>
            ) : null}
          </button>
        ))
      )}
    </div>
  );
}