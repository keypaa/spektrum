// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./composer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function textarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText("Getting ready...") as HTMLTextAreaElement;
}

describe("Composer", () => {
  it("shows the Getting ready... placeholder", () => {
    render(<Composer />);
    const el = textarea();
    expect(el.placeholder).toBe("Getting ready...");
  });

  it("grows with content up to five lines then scrolls", async () => {
    render(<Composer />);
    const el = textarea();
    // jsdom has no layout; stub the metrics the autogrow uses.
    let scrollHeight = 40;
    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    await userEvent.type(el, "a");
    scrollHeight = 400; // five lines
    await userEvent.type(el, "b");
    expect(el.style.height).toBe("80px"); // 5 × 16
    scrollHeight = 900;
    await userEvent.type(el, "c");
    expect(el.style.height).toBe("80px"); // still capped
    expect(el.style.overflowY).toBe("auto");
  });

  it("the thinking menu lists the five levels and updates the label", async () => {
    render(<Composer />);
    const trigger = screen.getByRole("button", { name: "Thinking: Medium" });
    await userEvent.click(trigger);
    for (const level of ["Minimal", "Low", "Medium", "High", "Extra high"]) {
      expect(screen.getByRole("menuitem", { name: level })).toBeTruthy();
    }
    await userEvent.click(screen.getByRole("menuitem", { name: "High" }));
    expect(screen.getByRole("button", { name: "Thinking: High" })).toBeTruthy();
  });

  it("the + menu opens with a disabled upload item", async () => {
    render(<Composer />);
    const plus = screen.getByRole("button", { name: "Add files" });
    await userEvent.click(plus);
    const item = screen.getByRole("menuitem", { name: /Upload files/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(item);
    // Disabled items cannot be activated; nothing happens.
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("the send and mic buttons are disabled", () => {
    render(<Composer />);
    expect(screen.getByRole("button", { name: "Send" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Voice mode" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("submits nothing (no fetch, no navigation)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Composer />);
    await userEvent.type(textarea(), "hello");
    await userEvent.keyboard("{Enter}");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});