"use client";

import { IconMoreHorizontal } from "@spektrum/ui/icons";
import { relativeTime } from "@/lib/relative-time";
import type { ProjectRow as ProjectRowModel } from "@/lib/projects";

function RowMenu({
  project,
  layout = "list",
}: {
  project: ProjectRowModel;
  onRename: (project: ProjectRowModel) => void;
  layout?: "list" | "grid";
}) {
  return (
    <div className={layout === "grid" ? "absolute right-0 top-0 flex-none text-fg-tertiary" : "flex-none py-2 text-fg-tertiary"}>
      <button
        type="button"
        aria-label={`${project.name} actions`}
        className="flex items-center justify-center rounded-md p-2 text-fg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg"
      >
        <IconMoreHorizontal size={18} />
      </button>
    </div>
  );
}

export function ProjectRow({
  project,
  now,
  onRename,
}: {
  project: ProjectRowModel;
  now: Date;
  onRename: (project: ProjectRowModel) => void;
}) {
  return (
    // Bundle row (`ft`), list mode: `flex items-center gap-3 text-sm
    // font-normal px-5` inside the parent's `divide-y` container — no fixed
    // height and no own border. The height is natural: the menu cell is
    // `py-2` + `p-2` trigger + 18 px icon = 50 CSS, + the 1 px divider from
    // `divide-y` = the measured 51 CSS pitch (57.6 physical).
    <div
      data-testid={`project-card-${project.id}`}
      className="group flex items-center gap-3 px-5 text-sm font-normal"
    >
      <button
        type="button"
        className="flex h-full flex-1 items-center gap-3 text-left focus-visible:outline-none"
        onClick={() => onRename(project)}
      >
        {/* List thumbnail: 50×40, no border/background on the container
            (the bundle only styles the grid thumbnail). Masked in the
            visual suite anyway. */}
        <span className="h-10 w-[50px] flex-none overflow-hidden" />
        <span className="truncate text-sm text-text-nav-primary">
          {project.name}
        </span>
      </button>
      {/* Bundle: `py-2 w-20 text-right text-xs font-light text-nowrap`. */}
      <span className="w-20 py-2 text-right text-xs font-light text-text-nav-secondary">
        {relativeTime(project.createdAt, now)}
      </span>
      <RowMenu project={project} onRename={onRename} />
    </div>
  );
}
