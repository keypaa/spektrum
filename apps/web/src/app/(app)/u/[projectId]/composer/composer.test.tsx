// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./composer";
import type { useChat } from "./use-chat";

afterEach(cleanup);

const baseChat = {
  threadId: null,
  parts: [],
  status: "idle" as const,
  error: null,
  send: vi.fn(),
  loadThread: vi.fn(),
  reset: vi.fn(),
  setDiffStatus: vi.fn(),
  stop: vi.fn(),
  retry: vi.fn(),
  rerun: vi.fn(),
};

function renderComposer(
  overrides: Partial<ReturnType<typeof useChat>> = {},
  aiEnabled = true,
) {
  const onReview = vi.fn();
  const onUploadFiles = vi.fn();
  render(
    <Composer
      chat={{ ...baseChat, ...overrides }}
      aiEnabled={aiEnabled}
      onReview={onReview}
      onUploadFiles={onUploadFiles}
      openTabs={["main.tex"]}
      onReviewDiff={vi.fn()}
    />,
  );
  return { onReview, onUploadFiles };
}

describe("Composer", () => {
  it("uses the Ask anything placeholder and disables Send when empty", () => {
    renderComposer();
    expect(screen.getByLabelText("Ask anything")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Send with text and sends on Enter", async () => {
    const chat = { ...baseChat };
    renderComposer(chat);
    const area = screen.getByLabelText("Ask anything");
    await userEvent.type(area, "hello{Enter}");
    expect(chat.send).toHaveBeenCalledWith("hello", "Extra high", ["main.tex"]);
  });

  it("shows Stop while streaming and calls stop", async () => {
    const chat = { ...baseChat, status: "streaming" as const };
    renderComposer(chat);
    const stop = screen.getByRole("button", { name: "Stop" });
    await userEvent.click(stop);
    expect(chat.stop).toHaveBeenCalled();
  });

  it("starts every chat at Extra high thinking", () => {
    renderComposer();
    expect(screen.getByLabelText("Thinking: Extra high")).toBeTruthy();
    expect(screen.queryByLabelText("Thinking: Medium")).toBeNull();
  });

  it("switches the thinking level", async () => {
    renderComposer();
    await userEvent.click(screen.getByLabelText("Thinking: Extra high"));
    await userEvent.click(screen.getByRole("menuitem", { name: "High" }));
    expect(screen.getByLabelText("Thinking: High")).toBeTruthy();
  });

  it("disables every AI surface without a key", () => {
    renderComposer({}, false);
    expect(screen.getByText("Add your API key in Settings")).toBeTruthy();
    expect(screen.queryByText("Review paper")).toBeNull();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the empty state and Review paper", async () => {
    const { onReview } = renderComposer();
    expect(screen.getByText("Ready when you are!")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Review paper" }));
    expect(onReview).toHaveBeenCalled();
  });

  it("the + menu offers Upload files & photos and opens a file picker", async () => {
    const { onUploadFiles } = renderComposer();
    await userEvent.click(screen.getByLabelText("Add files"));
    const item = screen.getByRole("menuitem", { name: /Upload files & photos/ });
    expect(item.hasAttribute("disabled")).toBe(false);

    const input = document.querySelector(
      'input[type="file"][multiple]',
    ) as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await userEvent.click(item);
    expect(click).toHaveBeenCalled();

    await userEvent.upload(
      input,
      new File(["x"], "paper.pdf", { type: "application/pdf" }),
    );
    expect(onUploadFiles).toHaveBeenCalledTimes(1);
    expect(onUploadFiles.mock.calls[0]![0]).toHaveLength(1);
  });

  it("renders the transcript when a thread has parts", () => {
    renderComposer({
      parts: [{ type: "text", text: "assistant reply" }],
    });
    expect(screen.getByText("assistant reply")).toBeTruthy();
  });

  it("surfaces a failed request instead of showing nothing", () => {
    renderComposer({ error: "gateway responded 429 (rate limited)" });
    expect(screen.getByRole("alert").textContent).toContain("429");
  });
});