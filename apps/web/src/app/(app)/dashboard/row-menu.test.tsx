// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectRow } from "@/lib/projects";

const { deleteProjectAction, duplicateProjectAction, renameProjectAction } = vi.hoisted(() => ({
  deleteProjectAction: vi.fn(async (_id: string) => {}),
  duplicateProjectAction: vi.fn(async (_id: string) => {}),
  renameProjectAction: vi.fn(async (_id: string, _name: string) => {}),
}));

vi.mock("@/lib/actions", () => ({
  deleteProjectAction,
  duplicateProjectAction,
  renameProjectAction,
}));

import { RenameDialog } from "./rename-dialog";
import { RowMenu } from "./row-menu";

// jsdom has no ResizeObserver; Radix's popper calls it when a menu/dialog opens.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}
if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const project: ProjectRow = {
  id: "p-1",
  name: "Alpha",
  folderId: null,
  createdAt: new Date("2026-11-09T12:00:00Z"),
};

describe("RowMenu", () => {
  it('has a trigger with aria-label "<name> actions" visible without hover', () => {
    render(<RowMenu project={project} onRename={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Alpha actions" });
    expect(trigger).toBeTruthy();
    // Visible without hover: no opacity-0 utility in list mode.
    expect(trigger.className).not.toContain("opacity-0");
  });

  it("shows menu items exactly Rename, Duplicate, Delete in that order", async () => {
    const user = userEvent.setup();
    render(<RowMenu project={project} onRename={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Alpha actions" }));

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((el) => el.textContent)).toEqual(["Rename", "Duplicate", "Delete"]);
  });

  it("does not style Delete with a destructive colour class", async () => {
    const user = userEvent.setup();
    render(<RowMenu project={project} onRename={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Alpha actions" }));
    const deleteItem = await screen.findByRole("menuitem", { name: "Delete" });

    expect(deleteItem.className).not.toContain("destructive");
    expect(deleteItem.className).not.toMatch(/text-red/);
  });

  it("calls onRename with the project when Rename is clicked", async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(<RowMenu project={project} onRename={onRename} />);

    await user.click(screen.getByRole("button", { name: "Alpha actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));

    expect(onRename).toHaveBeenCalledWith(project);
  });
});

describe("RenameDialog", () => {
  it('shows "Edit project name", description, Cancel, and Save', () => {
    render(<RenameDialog project={project} onOpenChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Edit project name" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Edit project name" })).toBeTruthy();
    expect(screen.getByText("Enter a new name for your project.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("keeps the dialog open and does not call the action when submitting an empty name", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<RenameDialog project={project} onOpenChange={onOpenChange} />);

    const input = screen.getByRole("textbox", { name: "Edit project name" });
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(renameProjectAction).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Edit project name" })).toBeTruthy();
  });
});
