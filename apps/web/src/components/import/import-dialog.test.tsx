// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportDialog } from "./import-dialog";

// jsdom has no ResizeObserver; Radix's popper calls it when a menu/dialog opens.
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ImportDialog", () => {
  it("posts the archive and renders the report", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            report: {
              projects: 2,
              files: 5,
              rewrittenPaths: 1,
              promotedMains: 0,
              conversationsImported: 1,
              conversationsSkipped: 1,
              rejectedPaths: [],
              skipped: [],
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ImportDialog open onOpenChange={() => {}} />);

    await userEvent.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File([new Uint8Array([1])], "p.zip", { type: "application/zip" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/2 projects/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("disables Import until a file is chosen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    render(<ImportDialog open onOpenChange={() => {}} />);
    const button = screen.getByRole("button", { name: "Import" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("shows the error message when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "too_large" }), { status: 413 })),
    );
    render(<ImportDialog open onOpenChange={() => {}} />);
    await userEvent.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File([new Uint8Array([1])], "p.zip", { type: "application/zip" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText(/too large/)).toBeTruthy();
  });
});