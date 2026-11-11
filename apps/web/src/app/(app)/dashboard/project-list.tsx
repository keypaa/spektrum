import type { ProjectRow } from "@/lib/projects";
import type { Sort } from "./dashboard-client";
import type { Layout } from "./layout-toggle";

export function ProjectList(_props: {
  projects: ProjectRow[];
  query: string;
  layout: Layout;
  sort: Sort;
  onSort: (sort: Sort) => void;
}) {
  return <div data-testid="project-list" className="flex min-h-0 flex-1 flex-col" />;
}
