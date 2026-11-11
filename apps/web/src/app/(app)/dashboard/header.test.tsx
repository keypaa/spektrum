// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardHeader } from "./header";
import type { Layout } from "./layout-toggle";

// jsdom has no ResizeObserver; Radix's popper calls it when a menu opens.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

afterEach(cleanup);

function Harness({ onLayoutChange }: { onLayoutChange: (layout: Layout) => void }) {
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<Layout>("list");

  return (
    <DashboardHeader
      query={query}
      onQueryChange={setQuery}
      layout={layout}
      onLayoutChange={(next) => {
        setLayout(next);
        onLayoutChange(next);
      }}
    />
  );
}

describe("DashboardHeader", () => {
  it("renders the title", () => {
    render(<Harness onLayoutChange={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Your Projects");
  });

  it("renders the search input with its label and placeholder", () => {
    render(<Harness onLayoutChange={vi.fn()} />);

    const input = screen.getByLabelText("Search") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.placeholder).toBe("Search");
  });

  it("renders a two-button layout toggle with exactly one pressed", () => {
    render(<Harness onLayoutChange={vi.fn()} />);

    const buttons = [
      screen.getByRole("button", { name: "List view" }),
      screen.getByRole("button", { name: "Grid view" }),
    ];
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
    ]);
  });

  it("calls onLayoutChange('grid') when Grid view is clicked", async () => {
    const onLayoutChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onLayoutChange={onLayoutChange} />);

    await user.click(screen.getByRole("button", { name: "Grid view" }));

    expect(onLayoutChange).toHaveBeenCalledWith("grid");
  });

  it("renders Import and New as buttons", () => {
    render(<Harness onLayoutChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Import" }).tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "New" }).tagName).toBe("BUTTON");
  });

  it("opens the Import menu with its items", async () => {
    const user = userEvent.setup();
    render(<Harness onLayoutChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(
      (await screen.findByRole("menuitem", { name: "Import archive (.zip, .tar.gz)" }))
        .textContent,
    ).toBe("Import archive (.zip, .tar.gz)");
    expect(screen.getByRole("menuitem", { name: "Import Folder" })).toBeTruthy();
  });

  it("opens the New menu with its items", async () => {
    const user = userEvent.setup();
    render(<Harness onLayoutChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "New" }));

    expect((await screen.findByRole("menuitem", { name: "Blank project" })).textContent).toBe(
      "Blank project",
    );
    expect(screen.getByRole("menuitem", { name: "Example project" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "New folder" })).toBeTruthy();
  });
});
