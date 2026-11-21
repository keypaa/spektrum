// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FIXTURE = readFileSync("e2e/visual/fixtures/example.pdf");

const state = vi.hoisted(() => ({
  doc: null as null | {
    path: string;
    content: string | null;
    blobKey: string | null;
  },
  pages: 2,
  emptyPage: 0,
  huge: false,
  getObjectCalls: 0,
}));

vi.mock("@spektrum/storage", () => ({
  getObject: vi.fn(async () => {
    state.getObjectCalls += 1;
    return { body: Buffer.from(FIXTURE), size: FIXTURE.length };
  }),
}));

vi.mock("@/lib/documents", () => ({
  getDocumentByPath: vi.fn(async () => state.doc),
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: vi.fn(() => ({
    promise: {
      numPages: state.pages,
      getPage: vi.fn(async (page: number) => ({
        getTextContent: async () => ({
          items:
            page === state.emptyPage
              ? []
              : [{ str: state.huge ? "x".repeat(20_000) : `text of page ${page}` }],
        }),
      })),
      cleanup: vi.fn(async () => undefined),
    },
  })),
}));

import { extractPdfText } from "./pdf-text";

function blobDoc(path = "brief.pdf"): void {
  state.doc = { path, content: null, blobKey: `p/${path}-${crypto.randomUUID()}` };
}

beforeEach(() => {
  state.doc = null;
  state.pages = 2;
  state.emptyPage = 0;
  state.huge = false;
  state.getObjectCalls = 0;
});

describe("extractPdfText", () => {
  it("extracts every page with page markers", async () => {
    blobDoc();
    const result = await extractPdfText("u", "p", "brief.pdf");
    expect(result.pages).toBe(2);
    expect(result.text).toContain("--- page 1 ---");
    expect(result.text).toContain("--- page 2 ---");
    expect(result.text).toContain("text of page 1");
    expect(result.text).toContain("text of page 2");
  });

  it("honours a page range", async () => {
    blobDoc();
    const result = await extractPdfText("u", "p", "brief.pdf", [2, 2]);
    expect(result.pages).toBe(1);
    expect(result.text).not.toContain("text of page 1");
    expect(result.text).toContain("text of page 2");
  });

  it("caps output and says how to get more", async () => {
    blobDoc();
    state.huge = true;
    const result = await extractPdfText("u", "p", "brief.pdf");
    expect(result.text.length).toBeLessThanOrEqual(30_100);
    expect(result.text).toContain(
      "[truncated — use read_pdf(path, pages) for more]",
    );
  });

  it("reuses the cached extraction", async () => {
    blobDoc();
    await extractPdfText("u", "p", "brief.pdf");
    await extractPdfText("u", "p", "brief.pdf");
    expect(state.getObjectCalls).toBe(1);
  });

  it("reports a page with no text layer", async () => {
    blobDoc();
    state.emptyPage = 1;
    const result = await extractPdfText("u", "p", "brief.pdf");
    expect(result.text).toContain("[page 1: no extractable text]");
  });

  it("returns inline text without fetching a blob", async () => {
    state.doc = {
      path: "notes.tex",
      content: "hello\nworld",
      blobKey: null,
    };
    const result = await extractPdfText("u", "p", "notes.tex");
    expect(result.text).toBe("hello\nworld");
    expect(state.getObjectCalls).toBe(0);
  });

  it("rejects missing, non-PDF and inaccessible documents", async () => {
    await expect(extractPdfText("u", "p", "gone.pdf")).rejects.toThrow();
    state.doc = { path: "notes.txt", content: null, blobKey: "p/notes" };
    await expect(extractPdfText("u", "p", "notes.txt")).rejects.toThrow();
    state.doc = { path: "brief.pdf", content: null, blobKey: null };
    await expect(extractPdfText("u", "p", "brief.pdf")).rejects.toThrow();
  });
});
