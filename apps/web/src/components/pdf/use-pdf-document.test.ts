import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPdfData } from "./use-pdf-document";

const pdf = readFileSync(
  join(process.cwd(), "e2e/visual/fixtures/example.pdf"),
);

describe("use-pdf-document", () => {
  it("loads the example PDF and reports its pages", async () => {
    const doc = await loadPdfData(new Uint8Array(pdf));
    expect(doc?.numPages).toBeGreaterThan(0);
    await doc?.cleanup();
  });

  it("returns null for bytes that are not a PDF", async () => {
    expect(await loadPdfData(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
