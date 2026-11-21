// @vitest-environment node
// Real pdfjs extraction, without the module mock used by pdf-text.test.ts.
// This is the only test that exercises a genuine PDF end to end, so it catches
// pdfjs upgrades or worker-path regressions that the stubbed tests cannot.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const FIXTURE = readFileSync("e2e/visual/fixtures/example.pdf");

const state = vi.hoisted(() => ({ blobKey: "" }));

vi.mock("@spektrum/storage", () => ({
  getObject: vi.fn(async () => ({
    body: Buffer.from(FIXTURE),
    size: FIXTURE.length,
  })),
}));

vi.mock("@/lib/documents", () => ({
  getDocumentByPath: vi.fn(async () => ({
    path: "brief.pdf",
    content: null,
    blobKey: state.blobKey,
  })),
}));

import { extractPdfText } from "./pdf-text";

describe("extractPdfText with real pdfjs", () => {
  it("extracts the text layer of a real PDF", async () => {
    state.blobKey = `real/${crypto.randomUUID()}.pdf`;
    const result = await extractPdfText("u", "p", "brief.pdf");
    expect(result.text).toContain("--- page 1 ---");
    expect(result.text).toMatch(/Prism\s+is an AI-powered/);
  });
});
