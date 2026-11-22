// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ containers: [] as HTMLElement[] }));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  TextLayer: class {
    constructor(opts: { container: HTMLElement }) {
      state.containers.push(opts.container);
    }
    render() {
      return Promise.resolve();
    }
    cancel() {}
  },
}));

vi.mock("./use-pdf-document", () => ({
  loadPdfDocument: vi.fn(async () => ({
    numPages: 1,
    getPage: async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 595 * scale,
        height: 842 * scale,
        scale,
        rawDims: { pageWidth: 595, pageHeight: 842, pageX: 0, pageY: 0 },
      }),
      getTextContent: async () => ({ items: [{ str: "hello" }], styles: {} }),
      render: () => ({ promise: Promise.resolve(), cancel() {} }),
    }),
    cleanup: async () => undefined,
  })),
}));

import { PdfViewer } from "./pdf-viewer";

beforeEach(() => {
  state.containers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        this.cb([{ target: el, isIntersecting: true } as IntersectionObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("renders a PDF.js text layer over the canvas so the text is selectable", async () => {
  render(<PdfViewer pdfUrl="/render.pdf" revision="r1" zoom={1} />);

  await waitFor(() => expect(document.querySelector(".pdf-text-layer")).not.toBeNull());
  const layer = document.querySelector(".pdf-text-layer") as HTMLElement;
  expect(state.containers).toHaveLength(1);
  expect(layer.style.getPropertyValue("--total-scale-factor")).toBe("1");
});
