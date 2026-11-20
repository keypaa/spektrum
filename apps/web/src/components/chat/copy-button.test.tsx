// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./copy-button";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CopyButton", () => {
  it("copies the text and confirms it", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<CopyButton text="hello" label="Copy message" />);

    await fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("does not toggle a parent details when clicked", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(
      <details>
        <summary>
          Thinking
          <CopyButton text="reasoning" label="Copy thinking" />
        </summary>
        <p>reasoning</p>
      </details>,
    );
    await fireEvent.click(screen.getByRole("button", { name: "Copy thinking" }));
    expect((screen.getByText("reasoning").closest("details") as HTMLDetailsElement).open).toBe(false);
  });
});
