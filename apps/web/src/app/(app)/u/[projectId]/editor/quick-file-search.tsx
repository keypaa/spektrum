"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { DocumentSummary } from "@/lib/documents";

/** The file-search overlay (D31): mirrors Phase 1's search copy. */
export function QuickFileSearch({
  documents,
  open,
  onOpenChange,
  onSelect,
}: {
  documents: DocumentSummary[];
  open: boolean;
  onOpenChange(open: boolean): void;
  onSelect(path: string): void;
}): ReactElement | null {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      inputRef.current?.focus();
    }
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? documents.filter((d) => d.path.toLowerCase().includes(needle))
      : documents;
    return list.slice(0, 50);
  }, [documents, query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Search files"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-[420px] overflow-hidden rounded-2xl bg-modal-bg shadow-menu"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          aria-label="Search files"
          placeholder="Search files"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) onSelect(matches[0].path);
            if (e.key === "Escape") onOpenChange(false);
          }}
          className="h-11 w-full border-b border-[color:var(--border-log)] bg-transparent px-4 text-sm text-text-editor-primary outline-none placeholder:text-text-editor-placeholder"
        />
        <ul className="max-h-80 overflow-y-auto p-1">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-editor-tertiary">
              No files match your search.
            </li>
          ) : (
            matches.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => onSelect(doc.path)}
                  className="flex h-8 w-full items-center rounded-lg px-3 text-left text-sm text-text-editor-secondary hover:bg-nav-bg-hover hover:text-text-editor-primary"
                >
                  <span className="truncate">{doc.path}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}