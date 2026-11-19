// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRow } from "@/lib/projects";
import type { Sort } from "./column-header";
import type { Layout } from "./layout-toggle";
import { ProjectList } from "./project-list";

// The empty state and the New menu both navigate after creating a project.
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
});

const NOW = new Date("2026-11-11T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function makeProjects(): ProjectRow[] {
  return [
    { id: "p-2d", name: "Alpha", folderId: null, createdAt: new Date(NOW.getTime() - 2 * DAY) },
    { id: "p-18d", name: "Beta", folderId: null, createdAt: new Date(NOW.getTime() - 18 * DAY) },
    { id: "p-6mo", name: "Gamma", folderId: null, createdAt: new Date(NOW.getTime() - 183 * DAY) },
    { id: "p-9mo", name: "Delta", folderId: null, createdAt: new Date(NOW.getTime() - 274 * DAY) },
  ];
}

function Harness({
  projects,
  initialSort = { key: "created", direction: "desc" },
  layout = "list",
}: {
  projects: ProjectRow[];
  initialSort?: Sort;
  layout?: Layout;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>(initialSort);
  return (
    <div>
      <label htmlFor="search">Search</label>
      <input
        id="search"
        aria-label="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ProjectList
        projects={projects}
        query={query}
        layout={layout}
        sort={sort}
        onSort={setSort}
      />
    </div>
  );
}

function cardIds() {
  return screen
    .getAllByTestId(/^project-card-/)
    .map((el) => el.getAttribute("data-testid"));
}

describe("ProjectList", () => {
  it("renders one project-card-* per project", () => {
    render(<Harness projects={makeProjects()} />);
    expect(cardIds()).toEqual([
      "project-card-p-2d",
      "project-card-p-18d",
      "project-card-p-6mo",
      "project-card-p-9mo",
    ]);
  });

  it("typing in the search box filters by case-insensitive substring", async () => {
    const user = userEvent.setup();
    render(<Harness projects={makeProjects()} />);

    await user.type(screen.getByLabelText("Search"), "mm");

    expect(cardIds()).toEqual(["project-card-p-6mo"]);
  });

  it("clicking Sort by Name re-orders; clicking again flips the direction", async () => {
    const user = userEvent.setup();
    render(<Harness projects={makeProjects()} />);

    await user.click(screen.getByRole("button", { name: "Sort by Name" }));
    expect(cardIds()).toEqual([
      "project-card-p-6mo", // Gamma
      "project-card-p-9mo", // Delta
      "project-card-p-18d", // Beta
      "project-card-p-2d", // Alpha
    ]);

    await user.click(screen.getByRole("button", { name: "Sort by Name" }));
    expect(cardIds()).toEqual([
      "project-card-p-2d", // Alpha
      "project-card-p-18d", // Beta
      "project-card-p-9mo", // Delta
      "project-card-p-6mo", // Gamma
    ]);
  });

  it("clicking Sort by Created sorts by date", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        projects={makeProjects()}
        initialSort={{ key: "name", direction: "asc" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sort by Created" }));
    expect(cardIds()).toEqual([
      "project-card-p-2d",
      "project-card-p-18d",
      "project-card-p-6mo",
      "project-card-p-9mo",
    ]);
  });

  it("the default sort is created descending", () => {
    render(<Harness projects={makeProjects()} initialSort={{ key: "created", direction: "desc" }} />);
    expect(cardIds()).toEqual([
      "project-card-p-2d",
      "project-card-p-18d",
      "project-card-p-6mo",
      "project-card-p-9mo",
    ]);
  });

  it("with zero projects the column header stays visible and the empty state replaces the rows", () => {
    render(<Harness projects={[]} />);
    expect(screen.getByTestId("project-list-header")).toBeTruthy();
    expect(screen.queryAllByTestId(/^project-card-/)).toHaveLength(0);
    expect(screen.getByTestId("project-empty-state")).toBeTruthy();
  });

  it("the relative date strings match the seeded offsets (2d, 18d, 6mo, 9mo)", () => {
    render(<Harness projects={makeProjects()} />);
    expect(screen.getByTestId("project-card-p-2d").textContent).toContain("2d");
    expect(screen.getByTestId("project-card-p-18d").textContent).toContain("18d");
    expect(screen.getByTestId("project-card-p-6mo").textContent).toContain("6mo");
    expect(screen.getByTestId("project-card-p-9mo").textContent).toContain("9mo");
  });

  it("the ⋯ button is present on every row without hover", () => {
    render(<Harness projects={makeProjects()} />);
    const buttons = screen.getAllByRole("button", { name: /actions$/ });
    expect(buttons).toHaveLength(4);
  });
});
