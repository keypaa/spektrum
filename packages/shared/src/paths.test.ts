import { describe, expect, it } from "vitest";
import {
  DocumentPathError,
  normalizeDocumentPath,
  sanitizeDiagnosticPath,
} from "./paths";

describe("normalizeDocumentPath", () => {
  it("keeps a clean path", () => {
    expect(normalizeDocumentPath("main.tex")).toBe("main.tex");
    expect(normalizeDocumentPath("a//b.tex")).toBe("a/b.tex");
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["/abs.tex", "absolute"],
    ["../x", "traversal"],
    ["a/../b", "traversal"],
    ["./x", "traversal"],
    ["a\\b", "separator"],
    ["a\u0000b", "characters"],
    ["x".repeat(201), "too_long"],
  ])("rejects %j as %s", (input, code) => {
    try {
      normalizeDocumentPath(input);
      throw new Error("expected a DocumentPathError");
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentPathError);
      expect((e as DocumentPathError).code).toBe(code);
    }
  });
});

describe("sanitizeDiagnosticPath", () => {
  it("strips a leading ./", () => {
    expect(sanitizeDiagnosticPath("./main.tex")).toBe("main.tex");
  });

  it("drops .. segments without throwing", () => {
    expect(sanitizeDiagnosticPath("../x")).toBe("x");
    expect(sanitizeDiagnosticPath("a/../../b.tex")).toBe("a/b.tex");
  });

  it("replaces backslashes and control characters", () => {
    expect(sanitizeDiagnosticPath("a\\b.tex")).toBe("a/b.tex");
    expect(sanitizeDiagnosticPath("a\u0000b.tex")).toBe("ab.tex");
  });

  it("caps the length", () => {
    expect(sanitizeDiagnosticPath("x".repeat(500)).length).toBe(200);
  });
});