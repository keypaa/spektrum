"use client";

import { cn } from "@spektrum/ui";
import { IconChevronExpand, IconSortAscending, IconSortDescending } from "@spektrum/ui/icons";

export type SortKey = "name" | "created";
export type SortDirection = "asc" | "desc";
export interface Sort {
  key: SortKey;
  direction: SortDirection;
}

// Bundle `p8`: each header shows ONE 12 px indicator — inactive headers get
// IconChevronExpand in text-nav-tertiary; the active header gets
// IconSortAscending/IconSortDescending in text-nav-secondary (verified in
// ref 12: Name shows the stacked up-down glyph, Created shows a down chevron).
function Indicator({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <IconChevronExpand size={12} className="text-text-nav-tertiary" />;
  return direction === "asc" ? (
    <IconSortAscending size={12} className="text-text-nav-secondary" />
  ) : (
    <IconSortDescending size={12} className="text-text-nav-secondary" />
  );
}

export function ColumnHeader({
  sort,
  onSort,
}: {
  sort: Sort;
  onSort: (sort: Sort) => void;
}) {
  const toggle = (key: SortKey) => {
    if (sort.key !== key) return onSort({ key, direction: "desc" });
    onSort({ key, direction: sort.direction === "desc" ? "asc" : "desc" });
  };

  return (
    <div
      data-testid="project-list-header"
      // Bundle `p8`: `flex items-center gap-3 px-5 py-2 text-xs
      // text-text-nav-secondary` — no fixed height, no own border. Its 34 CSS
      // height (py-2 + 18 px content) + the 1 px divider owned by the first row
      // below = 35 CSS = the measured 40 physical between the header divider
      // (y=134) and the first row divider (y=174).
      className="flex items-center gap-3 px-5 py-2 text-xs text-text-nav-secondary"
    >
      <button
        type="button"
        onClick={() => toggle("name")}
        aria-label="Sort by Name"
        className={cn(
          "flex flex-1 items-center gap-1 text-left transition-colors",
          sort.key === "name" ? "text-text-nav-secondary" : "text-text-nav-tertiary hover:text-text-nav-secondary",
        )}
      >
        Name
        <Indicator active={sort.key === "name"} direction={sort.direction} />
      </button>
      <button
        type="button"
        onClick={() => toggle("created")}
        aria-label="Sort by Created"
        className={cn(
          "flex w-20 items-center justify-end gap-1 text-nowrap transition-colors",
          sort.key === "created" ? "text-text-nav-secondary" : "text-text-nav-tertiary hover:text-text-nav-secondary",
        )}
      >
        Created
        <Indicator active={sort.key === "created"} direction={sort.direction} />
      </button>
      {/* Bundle `p8` trailing spacer: exactly `w-[26px] h-[18px]`. It mirrors
          the ⋯ trigger's box, so `Created` lands where the reference puts it. */}
      <div className="h-[18px] w-[26px]" aria-hidden="true" />
    </div>
  );
}
