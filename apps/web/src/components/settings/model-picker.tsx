"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronDown } from "@spektrum/ui/icons";
import type { ImageSupport } from "@/lib/ai/model-capabilities";

export interface ModelOption {
  id: string;
  label: string;
  imageSupport?: ImageSupport | undefined;
}

/**
 * A searchable picker for the gateway's model list. The search field doubles
 * as a free-text entry ("Use …"), so a model missing from the list can still
 * be selected. The current value is shown even when it is not in the options.
 */
export function ModelPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly ModelOption[];
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? options.filter(
            (option) =>
              option.id.toLowerCase().includes(needle) ||
              option.label.toLowerCase().includes(needle),
          )
        : options,
    [options, needle],
  );
  const exact = options.some((option) => option.id === needle);
  const canUseCustom = needle.length > 0 && !exact;

  return (
    <div ref={root} className="relative w-64 flex-none">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setOpen((v) => !v);
        }}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-[color:var(--border-outline)] bg-bg-app px-2 text-left text-sm text-text-editor-primary"
      >
        <span className="min-w-0 truncate">{value || "Select a model"}</span>
        <IconChevronDown size={14} className="flex-none text-text-editor-tertiary" />
      </button>

      {open ? (
        <div className="absolute right-0 top-9 z-50 w-96 rounded-xl border border-[color:var(--border-outline)] bg-bg-app p-1 shadow-menu">
          <input
            autoFocus
            aria-label={`Search ${label}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search models…"
            className="mb-1 h-8 w-full rounded-lg border border-[color:var(--border-outline)] bg-bg-code px-2 text-sm text-text-editor-primary outline-none placeholder:text-text-editor-tertiary"
          />
          <div role="listbox" aria-label={label} className="max-h-64 overflow-y-auto">
            {canUseCustom ? (
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange(query.trim());
                  setOpen(false);
                }}
                className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm text-text-editor-secondary hover:bg-nav-bg-hover"
              >
                Use &quot;{query.trim()}&quot;
              </button>
            ) : null}
            {filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className={`flex w-full flex-col rounded-lg px-2 py-1.5 text-left text-sm hover:bg-nav-bg-hover ${
                  option.id === value
                    ? "text-text-editor-primary"
                    : "text-text-editor-secondary"
                }`}
              >
                <span>{option.label}</span>
                <span className="truncate text-xs text-text-editor-tertiary">
                  {option.id}
                </span>
              </button>
            ))}
            {filtered.length === 0 && !canUseCustom ? (
              <p className="px-2 py-3 text-xs text-text-editor-tertiary">
                No matching models
              </p>
            ) : null}
          </div>
          <p className="px-2 py-1 text-xs text-text-editor-tertiary">
            {options.length} models available
          </p>
        </div>
      ) : null}
    </div>
  );
}
