// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShortcutsDialog } from "./shortcuts-dialog";

afterEach(cleanup);

const ROWS: Array<[string, string]> = [
  ["Go to PDF", "Ctrl+J"],
  ["Change All Occurrences", "Ctrl+F2"],
  ["Format Document", "Ctrl+Shift+I"],
  ["Bold text", "Ctrl+B"],
  ["Italic text", "Ctrl+I"],
  ["Cut", ""],
  ["Copy", ""],
  ["Paste", ""],
  ["Command Palette", ""],
  ["File Search", "F1"],
  ["Find", "Ctrl+F"],
  ["Save", "Ctrl+S"],
];

describe("ShortcutsDialog", () => {
  it("lists the twelve rows in order with their shortcuts", () => {
    render(<ShortcutsDialog open onOpenChange={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    const texts = [...dialog.querySelectorAll("li")].map((n) => n.textContent ?? "");
    expect(texts).toHaveLength(ROWS.length);
    for (const [label] of ROWS) {
      expect(texts.some((t) => t.includes(label))).toBe(true);
    }
    expect(dialog.textContent).toContain("Ctrl+J");
    expect(dialog.textContent).toContain("Ctrl+S");
  });

  it("closes on Esc", async () => {
    const onOpenChange = vi.fn();
    render(<ShortcutsDialog open onOpenChange={onOpenChange} />);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});