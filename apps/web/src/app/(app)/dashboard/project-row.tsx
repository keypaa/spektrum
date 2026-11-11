"use client";

import { relativeTime } from "@/lib/relative-time";
import type { ProjectRow as ProjectRowModel } from "@/lib/projects";
import { RowMenu } from "./row-menu";

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
    <div
      data-testid={`project-card-${project.id}`}
      className="group flex items-center gap-3 border-b border-[color:var(--project-list-divider)] px-5 text-sm font-normal"
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
