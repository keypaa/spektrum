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
      // Bundle: border neutral-300 in light only (`!isDark && "border ..."`);
      // dark has no border on the toggle.
      className="flex h-[38px] flex-row items-center gap-2 rounded-full border border-[color:var(--neutral-300)] bg-input-bg p-1 dark:border-transparent"
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
            // Bundle: `p-1.5` + an 18 px (text-lg, 1em) icon = a 30 px button.
            "flex h-[30px] w-[30px] items-center justify-center rounded-full p-1.5",
            layout === value
              ? "bg-optionmenu-bg-hover text-fg-primary"
              : "text-fg-tertiary hover:text-fg-secondary",
          )}
        >
          {value === "list" ? <IconList size={18} /> : <IconGrid size={18} />}
        </button>
      ))}
    </div>
  );
}
