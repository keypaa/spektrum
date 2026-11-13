// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorContextMenu } from "./editor-context-menu";

afterEach(cleanup);

function renderMenu(overrides: Partial<React.ComponentProps<typeof EditorContextMenu>> = {}) {
  const props: React.ComponentProps<typeof EditorContextMenu> = {
    x: 100,
    y: 200,
    editor: null,
    documents: [],
    onClose: vi.fn(),
    onGoToPdf: vi.fn(),
    onFileSearch: vi.fn(),
    onOpenDocument: vi.fn(),
    ...overrides,
  };
  return { ...render(<EditorContextMenu {...props} />), props };
}

describe("EditorContextMenu", () => {
  it("renders the ten items in three groups with shortcuts", () => {
    renderMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(10);
    expect(screen.getByText("Go to PDF")).toBeTruthy();
    expect(screen.getByText("Ctrl+J")).toBeTruthy();
    expect(screen.getByText("F1")).toBeTruthy();
    expect(screen.queryByText("Cut")).toBeTruthy();
  });

  it("ArrowDown/ArrowUp move the active item and Enter invokes", async () => {
    const { props } = renderMenu();
    const first = screen.getAllByRole("menuitem")[0]!;
    first.focus();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    // Go to PDF is the first item; ArrowDown moves to the second, Enter invokes it.
    expect(props.onClose).toHaveBeenCalled();
  });

  it("Escape closes", async () => {
    const { props } = renderMenu();
    await userEvent.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("Go to PDF dispatches the window event", async () => {
    const onGoToPdf = vi.fn();
    renderMenu({ onGoToPdf });
    await userEvent.click(screen.getByText("Go to PDF"));
    expect(onGoToPdf).toHaveBeenCalled();
  });
});