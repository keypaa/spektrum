// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatList, type ChatThreadSummary } from "./chat-list";

afterEach(cleanup);

const THREADS: ChatThreadSummary[] = [
  {
    id: "t1",
    title: "Older chat",
    titleSource: "llm",
    hasAssistantReply: true,
    createdAt: "2026-11-10T10:00:00.000Z",
  },
  {
    id: "t2",
    title: "Newer chat",
    titleSource: "fallback",
    hasAssistantReply: true,
    createdAt: "2026-11-12T10:00:00.000Z",
  },
];

function renderList(
  overrides: Partial<React.ComponentProps<typeof ChatList>> = {},
) {
  const props = {
    threads: THREADS,
    activeThreadId: "t2" as string | null,
    aiEnabled: true,
    busy: false,
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onRegenerate: vi.fn(),
    ...overrides,
  };
  render(<ChatList {...props} />);
  return props;
}

const rows = () =>
  screen.getAllByTestId(/^chat-row-/).map((node) => node.textContent);

describe("ChatList", () => {
  it("renders threads newest-first with their titles", () => {
    renderList();
    expect(rows()).toEqual(["Newer chat", "Older chat"]);
  });

  it("marks the active thread with aria-current", () => {
    renderList();
    expect(
      screen
        .getByTestId("chat-row-t2")
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByTestId("chat-row-t1").getAttribute("aria-current")).toBeNull();
  });

  it("clicking a row calls onSelect(thread)", async () => {
    const props = renderList();
    await userEvent.click(screen.getByText("Older chat"));
    expect(props.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1" }),
    );
  });

  it("orders the menu Regenerate title, Rename, Delete", async () => {
    renderList();
    await userEvent.click(screen.getByRole("button", { name: "Newer chat actions" }));
    const items = screen.getAllByRole("menuitem").map((n) => n.textContent);
    expect(items).toEqual(["Regenerate title", "Rename", "Delete"]);
  });

  it("disables Regenerate title when busy", async () => {
    renderList({ busy: true });
    await userEvent.click(screen.getByRole("button", { name: "Newer chat actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Regenerate title" }).hasAttribute("data-disabled"),
    ).toBe(true);
  });

  it("disables Regenerate title without an assistant reply", async () => {
    renderList({
      threads: [{ ...THREADS[0]!, hasAssistantReply: false }],
    });
    await userEvent.click(screen.getByRole("button", { name: "Older chat actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Regenerate title" }).hasAttribute("data-disabled"),
    ).toBe(true);
  });

  it("disables Regenerate title when AI is unavailable", async () => {
    renderList({ aiEnabled: false });
    await userEvent.click(screen.getByRole("button", { name: "Newer chat actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Regenerate title" }).hasAttribute("data-disabled"),
    ).toBe(true);
  });

  it("calls onRegenerate from the menu", async () => {
    const props = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Newer chat actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Regenerate title" }));
    expect(props.onRegenerate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t2" }),
    );
  });

  it("renames through an inline input and saves", async () => {
    const props = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Newer chat actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByLabelText("Chat title");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed chat{Enter}");
    expect(props.onRename).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t2" }),
      "Renamed chat",
    );
  });

  it("asks for confirmation before deleting", async () => {
    const props = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Newer chat actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Newer chat")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t2" }),
    );
  });
});