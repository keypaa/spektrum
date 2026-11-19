// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createBlankProject } = vi.hoisted(() => ({
  createBlankProject: vi.fn(async () => "p-1"),
}));

vi.mock("@/lib/actions", () => ({
  createBlankProject,
}));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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

  it("creates the project and opens it, rather than leaving the user on the dashboard", async () => {
    const user = userEvent.setup();
    render(<EmptyState />);

    await user.click(screen.getByRole("button", { name: "Start from Scratch" }));

    expect(createBlankProject).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/u/p-1"));
  });
});
