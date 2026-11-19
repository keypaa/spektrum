// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createBlankProject, createExampleProject } = vi.hoisted(() => ({
  createBlankProject: vi.fn(async () => "blank-id"),
  createExampleProject: vi.fn(async () => "example-id"),
}));
const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/lib/actions", () => ({ createBlankProject, createExampleProject }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}

import { NewMenu } from "./new-menu";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NewMenu", () => {
  it("opens the new project instead of leaving the user on the dashboard", async () => {
    const user = userEvent.setup();
    render(<NewMenu />);

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(await screen.findByRole("menuitem", { name: "Blank project" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/u/blank-id"));
  });

  it("does the same for the example project", async () => {
    const user = userEvent.setup();
    render(<NewMenu />);

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(await screen.findByRole("menuitem", { name: "Example project" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/u/example-id"));
  });
});