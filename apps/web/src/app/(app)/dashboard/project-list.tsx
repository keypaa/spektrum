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
    return sortProjects(filtered, sort);
  }, [projects, query, sort]);

  return (
    // Bundle: one scroll container (`overflow-auto`) whose inner list is
    // `flex flex-col divide-y divide-[var(--project-list-divider)]` — the
    // dividers (including the one under the column header) are owned by
    // `divide-y`, not by the rows. In grid mode the same container becomes a
    // grid without dividers and without the column header.
    <section className="relative flex min-h-0 flex-1 flex-col overflow-auto" data-testid="project-list">
      {layout === "list" ? (
        <div className="flex flex-col divide-y divide-[var(--project-list-divider)]">
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
            visible.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                now={now}
                onRename={setRenaming}
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
