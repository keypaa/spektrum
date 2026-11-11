// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createBlankProject } = vi.hoisted(() => ({
  createBlankProject: vi.fn(async () => {}),
}));

vi.mock("@/lib/actions", () => ({
  createBlankProject,
}));

import { EmptyState } from "./empty-state";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EmptyState", () => {
  it("renders the exact heading and sub-copy", () => {
    render(<EmptyState />);

    expect(screen.getByText("You don't have any projects yet")).toBeTruthy();
    expect(
      screen.getByText("Start with a hosted project on Prism"),
    ).toBeTruthy();
  });

  it("renders the Start from Scratch button (not New project)", () => {
    render(<EmptyState />);

    expect(
      screen.getByRole("button", { name: "Start from Scratch" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New project" })).toBeNull();
  });

  it("clicking the button calls createBlankProject", async () => {
    const user = userEvent.setup();
    render(<EmptyState />);

    await user.click(screen.getByRole("button", { name: "Start from Scratch" }));

    expect(createBlankProject).toHaveBeenCalledTimes(1);
  });
});
