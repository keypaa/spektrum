// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Transcript } from "./transcript";

afterEach(cleanup);

const props = { onReviewDiff: vi.fn() };

describe("Transcript", () => {
  it("shows user turns right-aligned in a grey bubble with a copy button", () => {
    render(<Transcript {...props} parts={[{ type: "text", text: "User: hello there" }]} />);
    const bubble = screen.getByText("hello there");
    expect(bubble.parentElement?.className).toContain("items-end");
    expect(bubble.className).toContain("rounded-2xl");
    expect(bubble.className).toContain("bg-bg-tertiary");
    expect(screen.getByRole("button", { name: "Copy message" })).toBeTruthy();
    expect(screen.queryByText(/User: hello/)).toBeNull();
  });

  it("shows @mentioned files as pills above the user message", () => {
    render(
      <Transcript
        {...props}
        parts={[{ type: "text", text: "User: read @main.tex and @brief.pdf please" }]}
      />,
    );
    const pills = screen.getAllByTestId("user-mention");
    expect(pills.map((pill) => pill.textContent)).toEqual([
      "@main.tex",
      "@brief.pdf",
    ]);
    expect(screen.getByText("read and please")).toBeTruthy();
  });

  it("renders assistant markdown with a copy button", () => {
    render(
      <Transcript {...props} parts={[{ type: "text", text: "**Pay attention**" }]} />,
    );
    expect(screen.getByText("Pay attention").tagName).toBe("STRONG");
    expect(screen.getByRole("button", { name: "Copy reply" })).toBeTruthy();
  });

  it("merges legacy split thinking parts into one block", () => {
    render(
      <Transcript
        {...props}
        parts={[
          { type: "thinking", text: "The" },
          { type: "thinking", text: " user is greeting casually." },
        ]}
      />,
    );
    expect(screen.getAllByText("Thinking")).toHaveLength(1);
    expect(screen.getByText("The user is greeting casually.")).toBeTruthy();
  });

  it("does not show an empty thinking block", () => {
    render(
      <Transcript
        {...props}
        parts={[
          { type: "thinking", text: "   " },
          { type: "text", text: "Answer" },
        ]}
      />,
    );
    expect(screen.queryByText("Thinking")).toBeNull();
    expect(screen.getByText("Answer")).toBeTruthy();
  });

  it("collapses repeated identical tool calls and results", () => {
    render(
      <Transcript
        {...props}
        parts={[
          { type: "tool_call", id: "1", name: "edit_file", args: { path: "main.tex" } },
          { type: "tool_result", id: "1", ok: false, summary: "oldText occurs 0 times" },
          { type: "tool_call", id: "2", name: "edit_file", args: { path: "main.tex" } },
          { type: "tool_result", id: "2", ok: false, summary: "oldText occurs 0 times" },
        ]}
      />,
    );
    expect(screen.getAllByText("edit_file")).toHaveLength(1);
    expect(screen.getAllByText("oldText occurs 0 times")).toHaveLength(1);
  });

  it("keeps the reasoning block free of action buttons", () => {
    render(
      <Transcript {...props} parts={[{ type: "thinking", text: "reasoning" }]} />,
    );
    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy thinking" })).toBeNull();
  });

  it("keeps a follow-up user message out of the previous assistant reply", () => {
    render(
      <Transcript
        {...props}
        parts={[
          { type: "text", text: "Previous answer" },
          { type: "text", text: "User: follow up question" },
        ]}
      />,
    );
    const bubble = screen.getByText("follow up question");
    expect(bubble.parentElement?.className).toContain("items-end");
    expect(bubble.className).toContain("rounded-2xl");
  });

  it("merges adjacent text fragments into one reply", () => {
    render(
      <Transcript
        {...props}
        parts={[
          { type: "text", text: "First line" },
          { type: "text", text: "second line" },
        ]}
      />,
    );
    expect(document.body.textContent).toContain("First line");
    expect(document.body.textContent).toContain("second line");
    expect(screen.getAllByRole("button", { name: "Copy reply" })).toHaveLength(1);
  });

  it("does not render the same adjacent reply twice", () => {
    render(
      <Transcript
        {...props}
        parts={[
          { type: "text", text: "Hi there" },
          { type: "text", text: "Hi there" },
        ]}
      />,
    );
    expect(screen.getAllByText("Hi there")).toHaveLength(1);
  });

  it("shows a thinking indicator while streaming", () => {
    render(<Transcript {...props} parts={[]} streaming />);
    expect(screen.getByText("Thinking...")).toBeTruthy();
  });
});
