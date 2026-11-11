"use client";

import { IconSearch } from "@spektrum/ui/icons";
import { ImportMenu } from "./import-menu";
import { LayoutToggle, type Layout } from "./layout-toggle";
import { NewMenu } from "./new-menu";

const DPR = 1.13;

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
      className="flex flex-row items-center justify-between gap-3 border-b border-[color:var(--project-list-divider)] px-5"
      style={{ height: `${70 / DPR}px`, borderBottomWidth: `${1 / DPR}px`, boxSizing: "border-box", paddingTop: `${1 / DPR}px` }}
    >
      {/* Ref: font-semibold text-lg font-inter text-text-nav-primary flex-1 text-nowrap overflow-hidden text-ellipsis */}
      <h1 className="flex-1 overflow-hidden text-ellipsis text-nowrap text-lg font-semibold text-text-nav-primary">
        Your Projects
      </h1>
      <div className="relative shrink-0 hidden md:block md:min-w-[50px] lg:min-w-[300px]">
        <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5">
          <IconSearch
            size={22}
            className="text-text-editor-tertiary"
          />
        </div>
        <input
          aria-label="Search"
          placeholder="Search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="flex w-full grow rounded-full border bg-input-bg py-2 pl-12 text-sm text-text-editor-primary shadow-xs placeholder:text-text-editor-tertiary hover:placeholder:text-text-editor-primary focus:placeholder-transparent focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-accent border-[color:var(--neutral-300)] hover:border-[color:var(--neutral-400)] dark:border-[var(--search-input-border)] dark:hover:border-[var(--search-input-border-hover)] dark:active:border-[var(--search-input-border-active)]"
        />
      </div>
      <LayoutToggle layout={layout} onChange={onLayoutChange} />
      <ImportMenu />
      <NewMenu />
    </header>
  );
}
