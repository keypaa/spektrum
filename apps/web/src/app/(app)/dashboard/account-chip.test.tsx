// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { signOut } = vi.hoisted(() => ({
  signOut: vi.fn(async () => {}),
}));

vi.mock("@/auth/client", () => ({
  authClient: { signOut },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { AccountChip } from "./account-chip";

// jsdom has no ResizeObserver; Radix's popper calls it when a menu opens.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}
if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const userName = "Ada Lovelace";
const userEmail = "ada@example.com";

async function openMenu() {
  const user = userEvent.setup();
  render(<AccountChip userName={userName} userEmail={userEmail} />);
  await user.click(screen.getByTestId("account-chip"));
}

describe("AccountChip", () => {
  it("shows the owner's name and Personal workspace", () => {
    render(<AccountChip userName={userName} userEmail={userEmail} />);

    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Personal workspace")).toBeTruthy();
  });

  it("shows the avatar with the first initial", () => {
    render(<AccountChip userName={userName} userEmail={userEmail} />);

    expect(screen.getByText("A")).toBeTruthy();
  });

  it("shows menu items exactly Settings, Keyboard shortcuts, Give feedback, the email, Sign out", async () => {
    await openMenu();

    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");

    expect(items.map((item) => item.textContent)).toEqual([
      "Settings",
      "Keyboard shortcuts",
      "Give feedback",
      userEmail,
      "Sign out",
    ]);
  });

  it("has Sign out as the last item preceded by a separator", async () => {
    await openMenu();

    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    const separators = within(menu).getAllByRole("separator");

    expect(items.at(-1)?.textContent).toBe("Sign out");
    expect(separators).toHaveLength(1);

    const signOutItem = items.at(-1)!;
    const [separator] = separators;
    expect(
      separator!.compareDocumentPosition(signOutItem) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not show a Discord item", async () => {
    await openMenu();

    expect(screen.queryByText("Discord")).toBeNull();
  });
});
