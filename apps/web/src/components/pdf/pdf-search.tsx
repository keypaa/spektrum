"use client";

// The PDF search pill (spec §8.1): a dark pill below the chrome. The parent
// owns the query and the highlights; this component owns the field.

import { useEffect, useRef } from "react";

export interface PdfSearchProps {
  query: string;
  onQuery: (query: string) => void;
  onClose: () => void;
}

export function PdfSearch({
  query,
  onQuery,
  onClose,
}: PdfSearchProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      data-testid="pdf-search"
      role="search"
      className="absolute right-3 top-14 z-10 flex h-10 items-center rounded-3xl bg-[#353535] px-4 text-white shadow-[var(--shadow-surface)]"
    >
      <input
        ref={inputRef}
        aria-label="Search the PDF"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") onClose();
        }}
        className="w-56 bg-transparent text-sm text-white outline-none placeholder:text-white/60"
        placeholder="Search"
      />
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="ml-2 text-white/70"
      >
        ×
      </button>
    </div>
  );
}