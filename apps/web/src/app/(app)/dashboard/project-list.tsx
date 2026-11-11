import type { ProjectRow } from "@/lib/projects";

export function ProjectList(_props: { projects: ProjectRow[] }) {
  return <div data-testid="project-list" className="flex min-h-0 flex-1 flex-col" />;
}
