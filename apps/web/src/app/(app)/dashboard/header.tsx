"use client";

import { IconSearch } from "@spektrum/ui/icons";
import { Input } from "@spektrum/ui";
import { ImportMenu } from "./import-menu";
import { LayoutToggle, type Layout } from "./layout-toggle";
import { NewMenu } from "./new-menu";

export function DashboardHeader({
  query,
  onQueryChange,
  layout,
  onLayoutChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
}) {
  return (
    <header
      data-testid="dashboard-header"
      className="flex items-center gap-3 border-b border-[color:var(--project-list-divider)] px-5 py-[11.473px]"
    >
      {/* Bundle: `font-semibold text-lg font-inter text-text-nav-primary` (default
          28 px line-height; the header's 70 physical = 62 CSS height comes from
          py-3 + the 38 px controls + the 1 px border, not from the title). */}
      <h1 className="text-lg font-semibold text-text-nav-primary">Your Projects</h1>
      <div className="flex-1" />
      {/* Bundle: icon is 22 px at start-3.5, input pl-12, rounded-full,
          bg-input-bg; border = neutral-300 in light, --search-input-border
          in dark (measured: light edge #aeaeae ≈ neutral-300, dark edge
          ≈ neutral-500). Placeholder colour is text-editor-tertiary and
          hides on focus. */}
      <div className="relative w-[300px]">
        <IconSearch
          size={22}
          className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-text-editor-tertiary"
        />
        <Input
          aria-label="Search"
          placeholder="Search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="h-[38px] rounded-full border-[color:var(--neutral-300)] bg-input-bg pl-12 placeholder:text-text-editor-tertiary focus:placeholder-transparent dark:border-[color:var(--search-input-border)]"
        />
      </div>
      <LayoutToggle layout={layout} onChange={onLayoutChange} />
      <ImportMenu />
      <NewMenu />
    </header>
  );
}
