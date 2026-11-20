"use client";

import { useEffect, useRef, useState } from "react";
import { Toggle } from "@spektrum/ui";
import { IconSliders } from "@spektrum/ui/icons";

/** Which editor surfaces are currently visible. */
export interface ViewVisibility {
  code: boolean;
  pdf: boolean;
  sidebar: boolean;
  assistant: boolean;
}

export const DEFAULT_VIEW: ViewVisibility = {
  code: true,
  pdf: true,
  sidebar: true,
  assistant: true,
};

/** Grid column sizes follow the visibility toggles. */
export function layoutForView(view: ViewVisibility): {
  sidebarWidth: string;
  rightPaneWidth: string;
} {
  return {
    sidebarWidth: view.sidebar ? "442px" : "44px",
    rightPaneWidth: view.pdf ? "677px" : "0px",
  };
}

const LABELS: Record<keyof ViewVisibility, string> = {
  code: "Code",
  pdf: "PDF",
  sidebar: "Sidebar",
  assistant: "Assistant",
};

/**
 * The top-of-sidebar control that replaces the duplicate account avatar.
 * Mirrors Prism's view menu: toggles for Code, PDF, Sidebar and Assistant.
 */
export function ViewControlsMenu({
  value,
  onChange,
}: {
  value: ViewVisibility;
  onChange(next: ViewVisibility): void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex-none">
      <button
        type="button"
        aria-label="View controls"
        aria-expanded={open}
        title="View controls"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-button-secondary-bg text-button-secondary-text ring-2 ring-bg-app transition-colors hover:bg-nav-bg-hover"
      >
        <IconSliders size={16} />
      </button>
      {open ? (
        <div
          data-testid="view-controls-menu"
          className="absolute right-0 top-9 z-50 w-48 rounded-2xl bg-optionmenu-bg p-1 shadow-menu"
        >
          {(Object.keys(LABELS) as (keyof ViewVisibility)[]).map((key) => (
            <div
              key={key}
              className="flex h-10 items-center justify-between gap-3 rounded-xl px-3"
            >
              <span className="text-sm text-optionmenu-text-primary">
                {LABELS[key]}
              </span>
              <Toggle
                label={LABELS[key]}
                checked={value[key]}
                onCheckedChange={(checked) => onChange({ ...value, [key]: checked })}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
