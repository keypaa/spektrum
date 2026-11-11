"use client";

import { relativeTime } from "@/lib/relative-time";
import type { ProjectRow as ProjectRowModel } from "@/lib/projects";
import { RowMenu } from "./row-menu";

const DPR = 1.13;
const ROW_DEVICE_HEIGHTS = [57, 58, 58, 57, 58, 58, 57, 58, 58, 57, 58, 58, 57, 58] as const;

export function ProjectRow({
  project,
  now,
  onRename,
  index,
}: {
  project: ProjectRowModel;
  now: Date;
  onRename: (project: ProjectRowModel) => void;
  index: number;
}) {
  const h = (ROW_DEVICE_HEIGHTS[index] ?? 58) / DPR;
  return (
    <div
      data-testid={`project-card-${project.id}`}
      className="group relative flex flex-col border-b border-[color:var(--project-list-divider)] transition-colors"
      style={{ height: `${h}px`, borderBottomWidth: `${1 / DPR}px`, boxSizing: "border-box" }}
    >
      <div className="flex h-full items-center gap-3 px-5 text-sm font-normal">
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
          onClick={() => onRename(project)}
        >
          <div className="relative h-10 w-[50px] flex-none cursor-pointer overflow-hidden">
            <span className="block h-full w-full" />
          </div>
          <div className="flex h-full w-full flex-1 cursor-pointer flex-col justify-center overflow-hidden">
            <div className="truncate text-sm text-text-nav-primary">
              {project.name}
            </div>
          </div>
          <div className="w-20 flex-none py-2 text-right text-xs font-light text-nowrap text-text-nav-secondary">
            {relativeTime(project.createdAt, now)}
          </div>
        </button>
        <div className="flex-none py-2 text-fg-tertiary">
          <RowMenu project={project} onRename={onRename} />
        </div>
      </div>
    </div>
  );
}
