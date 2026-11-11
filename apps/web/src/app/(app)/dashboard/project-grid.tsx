"use client";

import { relativeTime } from "@/lib/relative-time";
import type { ProjectRow as ProjectRowModel } from "@/lib/projects";
import { RowMenu } from "./row-menu";

export function ProjectGrid({
  projects,
  now,
  onRename,
}: {
  projects: ProjectRowModel[];
  now: Date;
  onRename: (project: ProjectRowModel) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,140px))] justify-start gap-x-4 gap-y-5 px-5 py-4">
      {projects.map((project) => (
        <div
          key={project.id}
          data-testid={`project-card-${project.id}`}
          className="group relative flex h-[148px] w-full min-w-0 flex-col overflow-hidden rounded-lg hover:bg-[var(--project-list-hover-bg)]"
        >
          <button
            type="button"
            onClick={() => onRename(project)}
            className="flex h-full w-full flex-col items-center gap-1.5 rounded-lg px-2 pb-2 pt-4 text-center"
          >
            <span className="h-[68px] w-[88px] flex-none overflow-hidden rounded-[5px] border border-[color:var(--project-list-divider)] bg-white p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.22)]" />
            <span className="w-full truncate text-[13px] font-medium leading-4 text-fg-primary">
              {project.name}
            </span>
            <span className="w-full truncate text-xs leading-4 text-fg-tertiary">
              {relativeTime(project.createdAt, now)}
            </span>
          </button>
          <RowMenu project={project} onRename={onRename} layout="grid" />
        </div>
      ))}
    </div>
  );
}
