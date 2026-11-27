// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportDialog, isZipArchive } from "./import-dialog";

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

  // Spec §13.2.7: the result screen lists project count, file count, rewritten
  // include paths, promoted mains, imported/skipped conversations, rejected paths.
  it("renders every field of the §13.2.7 report", async () => {
    const report = {
      projects: 1,
      files: 3,
      rewrittenPaths: 2,
      promotedMains: 1,
      conversationsImported: 4,
      conversationsSkipped: 3,
      rejectedPaths: ["../evil.tex", "/abs.tex"],
      skipped: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ report }), { status: 200 })),
    );
    render(<ImportDialog open onOpenChange={() => {}} />);
    await userEvent.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File([new Uint8Array([1])], "p.zip", { type: "application/zip" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/1 project imported/)).toBeTruthy();
    expect(screen.getByText(/3 files/)).toBeTruthy();
    expect(screen.getByText(/2 paths rewritten/)).toBeTruthy();
    expect(screen.getByText(/1 main document promoted/)).toBeTruthy();
    expect(screen.getByText(/4 conversations imported/)).toBeTruthy();
    expect(screen.getByText(/3 conversations skipped/)).toBeTruthy();
    expect(screen.getByText(/2 paths rejected/)).toBeTruthy();
  });

  it("omits the zero-count lines that would be noise", async () => {
    const report = {
      projects: 1,
      files: 1,
      rewrittenPaths: 0,
      promotedMains: 0,
      conversationsImported: 0,
      conversationsSkipped: 0,
      rejectedPaths: [],
      skipped: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ report }), { status: 200 })),
    );
    render(<ImportDialog open onOpenChange={() => {}} />);
    await userEvent.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File([new Uint8Array([1])], "p.zip", { type: "application/zip" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText(/1 project imported/)).toBeTruthy();
    expect(screen.queryByText(/rewritten/)).toBeNull();
    expect(screen.queryByText(/promoted/)).toBeNull();
    expect(screen.queryByText(/skipped/)).toBeNull();
  });

  it("uploads the archive to R2 first and posts only the signed key", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const report = {
      projects: 1,
      files: 1,
      rewrittenPaths: 0,
      promotedMains: 0,
      conversationsImported: 0,
      conversationsSkipped: 0,
      rejectedPaths: [],
      skipped: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === "/api/uploads/sign") {
          return new Response(
            JSON.stringify({
              key: "u/u1/import/00000000-0000-4000-8000-000000000000.zip",
              url: "https://r2.test/put",
              headers: { "Content-Type": "application/zip" },
              expiresAt: "2026-11-27T12:00:00.000Z",
            }),
            { status: 201 },
          );
        }
        if (url === "https://r2.test/put") return new Response(null, { status: 200 });
        return new Response(JSON.stringify({ report }), { status: 200 });
      }),
    );
    render(<ImportDialog open onOpenChange={() => {}} />);
    await userEvent.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "p.zip", {
        type: "application/zip",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/1 project imported/)).toBeTruthy();
    expect(calls.map((c) => c.url)).toEqual([
      "/api/uploads/sign",
      "https://r2.test/put",
      "/api/import",
    ]);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      kind: "import",
      ext: "zip",
      contentType: "application/zip",
      sizeBytes: 4,
    });
    expect(calls[1]!.init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[2]!.init?.body))).toEqual({
      name: "p.zip",
      blobKey: "u/u1/import/00000000-0000-4000-8000-000000000000.zip",
      contentType: "application/zip",
    });
  });

  it("only offers .zip archives in the file picker", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    render(<ImportDialog open onOpenChange={() => {}} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe(".zip");
  });

  it("classifies only .zip archives as importable", () => {
    expect(isZipArchive(new File([new Uint8Array([1])], "p.zip"))).toBe(true);
    expect(isZipArchive(new File([new Uint8Array([1])], "P.ZIP"))).toBe(true);
    expect(isZipArchive(new File([new Uint8Array([1])], "p.tar.gz"))).toBe(false);
    expect(isZipArchive(new File([new Uint8Array([1])], "p"))).toBe(false);
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