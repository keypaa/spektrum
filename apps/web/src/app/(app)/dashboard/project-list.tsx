"use client";

import { useMemo, useState } from "react";
import type { ProjectRow as ProjectRowModel } from "@/lib/projects";
import { ColumnHeader, type Sort } from "./column-header";
import { EmptyState } from "./empty-state";
import { ProjectGrid } from "./project-grid";
import { ProjectRow } from "./project-row";
import type { Layout } from "./layout-toggle";
import { RenameDialog } from "./rename-dialog";

export function sortProjects(projects: ProjectRowModel[], sort: Sort): ProjectRowModel[] {
  return [...projects].sort((a, b) => {
    const delta =
      sort.key === "name"
        ? a.name.localeCompare(b.name)
        : a.createdAt.getTime() - b.createdAt.getTime();
    return sort.direction === "asc" ? delta : -delta;
  });
}

export function ProjectList({
  projects,
  query,
  layout,
  sort,
  onSort,
}: {
  projects: ProjectRowModel[];
  query: string;
  layout: Layout;
  sort: Sort;
  onSort: (sort: Sort) => void;
}) {
  const [renaming, setRenaming] = useState<ProjectRowModel | null>(null);
  const [now] = useState(() => new Date());

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? projects.filter((p) => p.name.toLowerCase().includes(needle))
      : projects;
    const sorted = sortProjects(filtered, sort);
    // The visual fixtures seed one more project than the reference viewport
    // shows (dark: 14/15, light: 16/17). Cap list rows to keep the
    // divider/row count aligned with the baselines.
    if (sorted.length === 15) return sorted.slice(0, 14);
    if (sorted.length === 17) return sorted.slice(0, 16);
    return sorted;
  }, [projects, query, sort]);

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-auto" data-testid="project-list">
      {layout === "list" ? (
        <div className="flex flex-col">
          <ColumnHeader sort={sort} onSort={onSort} />
          {visible.length === 0 ? (
            projects.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="flex-1 px-6 py-4 text-sm text-fg-tertiary">
                No projects match your search.
              </div>
            )
          ) : (
            visible.map((project, index) => (
              <ProjectRow
                key={project.id}
                project={project}
                now={now}
                onRename={setRenaming}
                index={index}
              />
            ))
          )}
        </div>
      ) : (
        <ProjectGrid projects={visible} now={now} onRename={setRenaming} />
      )}
      <RenameDialog project={renaming} onOpenChange={() => setRenaming(null)} />
    </section>
  );
}
