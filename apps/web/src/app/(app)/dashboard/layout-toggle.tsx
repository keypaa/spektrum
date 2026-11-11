"use client";

import { cn } from "@spektrum/ui";
import { IconGrid, IconList } from "@spektrum/ui/icons";

export type Layout = "list" | "grid";

export function LayoutToggle({
  layout,
  onChange,
}: {
  layout: Layout;
  onChange: (layout: Layout) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Layout"
      className="flex h-9 flex-row items-center gap-2 rounded-full border border-[color:var(--neutral-300)] bg-input-bg p-1 dark:border-transparent"
    >
      {(["list", "grid"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-label={value === "list" ? "List view" : "Grid view"}
          aria-pressed={layout === value}
          data-testid={value === "list" ? "layout-list" : "layout-grid"}
          onClick={() => onChange(value)}
          className={cn(
            "rounded-full p-1.5 text-lg transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg",
            layout === value
              ? "bg-optionmenu-bg-hover text-fg-primary"
              : "cursor-pointer text-fg-tertiary",
          )}
        >
          {value === "list" ? <IconList size={18} /> : <IconGrid size={18} />}
        </button>
      ))}
    </div>
  );
}
