// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DataControlsSection } from "./data-controls-section";

let href = "";

beforeEach(() => {
  href = "";
  // jsdom cannot navigate; the section only needs the assignment to be
  // observable.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      get href() {
        return href;
      },
      set href(next: string) {
        href = next;
      },
      origin: "http://localhost:3000",
    },
  });
});

afterEach(() => {
  cleanup();
});

describe("DataControlsSection", () => {
  it("enables Download zip and points it at the export route", async () => {
    render(<DataControlsSection />);
    const button = screen.getByRole("button", { name: "Download zip" });
    expect(button.hasAttribute("disabled")).toBe(false);
    await userEvent.click(button);
    expect(href).toBe("/api/projects/export");
  });
});