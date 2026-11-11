// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShutdownBanner } from "./shutdown-banner";

afterEach(cleanup);

describe("ShutdownBanner", () => {
  it("renders the exact copy", () => {
    render(<ShutdownBanner onClose={vi.fn()} />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Prism will shut down on January 1, 2027.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Export your Prism projects before the shutdown date to keep a copy of your files.",
      ),
    ).toBeTruthy();
  });

  it("renders both buttons with the exact labels", () => {
    render(<ShutdownBanner onClose={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Open export settings" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Migration guide" })).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ShutdownBanner onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has no emoji and every svg has viewBox 0 0 16 16", () => {
    const { container } = render(<ShutdownBanner onClose={vi.fn()} />);

    expect(container.textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(svg.getAttribute("viewBox")).toBe("0 0 16 16");
    }
  });
});
