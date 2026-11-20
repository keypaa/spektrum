// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutlinePanel } from "./outline-panel";
import type { OutlineNode } from "@/lib/outline";

afterEach(cleanup);

const ITEMS: OutlineNode[] = [
  {
    id: "l2",
    title: "Introduction",
    line: 2,
    level: 2,
    children: [
      { id: "l3", title: "The simulator", line: 3, level: 3, children: [] },
    ],
  },
];

describe("OutlinePanel", () => {
  it("lists sections and jumps to their line", async () => {
    const onNavigate = vi.fn();
    render(<OutlinePanel items={ITEMS} onNavigate={onNavigate} />);
    await fireEvent.click(screen.getByText("The simulator"));
    expect(onNavigate).toHaveBeenCalledWith(3);
  });

  it("collapses to a single header row", async () => {
    render(<OutlinePanel items={ITEMS} onNavigate={vi.fn()} />);
    expect(screen.getByText("Introduction")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Toggle outline" }));
    expect(screen.queryByText("Introduction")).toBeNull();
  });

  it("resizes by dragging the top handle upward", () => {
    render(<OutlinePanel items={ITEMS} onNavigate={vi.fn()} />);
    const panel = screen.getByTestId("outline-panel");
    const handle = screen.getByRole("separator", { name: "Resize outline" });
    const initial = (panel as HTMLElement).style.height;
    fireEvent.pointerDown(handle, { clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(window, { clientY: 140, pointerId: 1 });
    expect((panel as HTMLElement).style.height).not.toBe(initial);
  });
});
