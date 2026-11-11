// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createFolderAction } = vi.hoisted(() => ({
  createFolderAction: vi.fn(async (_name: string) => {}),
}));

vi.mock("@/lib/actions", () => ({
  createFolderAction,
}));

import { NewFolderDialog } from "./new-folder-dialog";

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

describe("NewFolderDialog", () => {
  it("is closed when open is false", () => {
    render(<NewFolderDialog open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByRole("heading", { name: "New folder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create folder" })).toBeNull();
  });

  it('shows title "New folder", description "Create a folder to organize your projects.", and actions Cancel and Create folder', () => {
    render(<NewFolderDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "New folder" })).toBeTruthy();
    expect(
      screen.getByText("Create a folder to organize your projects."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create folder" })).toBeTruthy();
  });

  it("disables Create folder while the input is empty or whitespace-only", async () => {
    const user = userEvent.setup();
    render(<NewFolderDialog open onOpenChange={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Create folder" });
    expect(button.hasAttribute("disabled")).toBe(true);

    const input = screen.getByRole("textbox", { name: "New folder" });
    await user.type(input, "   ");
    expect(button.hasAttribute("disabled")).toBe(true);

    await user.clear(input);
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("submitting calls createFolderAction with the trimmed name and closes the dialog", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<NewFolderDialog open onOpenChange={onOpenChange} />);

    const input = screen.getByRole("textbox", { name: "New folder" });
    await user.type(input, "  My Folder  ");
    await user.click(screen.getByRole("button", { name: "Create folder" }));

    await waitFor(() => {
      expect(createFolderAction).toHaveBeenCalledWith("My Folder");
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("focuses the input on open", () => {
    render(<NewFolderDialog open onOpenChange={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: "New folder" });
    expect(document.activeElement).toBe(input);
  });
});
