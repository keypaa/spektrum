"use client";

// The Logs tab (spec §9.4): filter menu, diagnostic cards, Raw logs, and a
// `Fix with AI` action per entry plus `Fix all with AI` (spec §12.5). Every
// action is a sibling button, never nested inside the jump button.

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
  /** Send the given diagnostics to the model (spec §12.5). */
  onFix: (diagnostics: Diagnostic[]) => void;
  aiEnabled: boolean;
}

export function Logs({
  diagnostics,
  log,
  onJump,
  onFix,
  aiEnabled,
}: LogsProps): React.ReactElement {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "warnings")
      return diagnostics.filter((d) => d.severity === "warning");
    if (filter === "errors")
      return diagnostics.filter((d) => d.severity === "error");
    return diagnostics;
  }, [diagnostics, filter]);

  const filterRow = (
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
      {aiEnabled ? (
        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={() => onFix(filtered)}
          className="ml-auto h-8 rounded-full border border-[color:var(--border-log)] px-3 text-xs disabled:opacity-50"
        >
          Fix all with AI
        </button>
      ) : (
        <span className="ml-auto text-xs text-fg-tertiary">
          Add your API key in Settings
        </span>
      )}
    </div>
  );

  if (filter === "raw") {
    return (
      <div className="flex flex-col gap-2 p-2">
        {filterRow}
        <pre
          data-testid="logs-raw"
          className="overflow-auto rounded-lg bg-bg-code p-2 font-mono text-xs"
        >
          {log ?? ""}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {filterRow}

      {filtered.length === 0 ? (
        <p className="p-4 text-sm text-fg-tertiary">No errors or warnings</p>
      ) : (
        filtered.map((diagnostic, index) => (
          <div
            key={`${diagnostic.message}-${diagnostic.line ?? index}`}
            data-testid="log-card"
            className="flex items-start gap-2 rounded-lg border border-[color:var(--border-log)] bg-bg-log p-2"
          >
            <button
              type="button"
              onClick={() => onJump(diagnostic)}
              className="flex min-w-0 flex-1 flex-col gap-1 text-left"
            >
              <span className="flex items-center gap-2 text-sm">
                {diagnostic.severity === "error" ? (
                  <IconError size={16} />
                ) : (
                  <IconWarning size={16} />
                )}
                <span>{diagnostic.message}</span>
              </span>
              {diagnostic.file ? (
                <span className="text-xs text-fg-tertiary">
                  {diagnostic.file}
                  {diagnostic.line !== undefined ? `:${diagnostic.line + 1}` : ""}
                </span>
              ) : null}
            </button>
            {aiEnabled ? (
              <button
                type="button"
                onClick={() => onFix([diagnostic])}
                className="h-7 flex-none rounded-full border border-[color:var(--border-log)] px-3 text-xs"
              >
                Fix with AI
              </button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}