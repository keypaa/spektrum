import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { contentHash, revisionHash } from "./revision";

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

describe("contentHash", () => {
  it("hashes UTF-8 bytes, not UTF-16 code units", () => {
    expect(contentHash("é")).toBe(sha256("é"));
    expect(contentHash("é")).toBe(
      createHash("sha256").update(Buffer.from("é", "utf8")).digest("hex"),
    );
  });

  it("hashes null as the empty string", () => {
    expect(contentHash(null)).toBe(sha256(""));
    expect(contentHash("")).toBe(sha256(""));
  });

  it("distinguishes content that differs by one character", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
});

describe("revisionHash", () => {
  it("is stable for identical input", () => {
    const docs = [
      { path: "main.tex", content: "a" },
      { path: "refs.bib", content: "b" },
    ];
    expect(revisionHash(docs)).toBe(revisionHash(docs));
  });

  it("does not depend on input order", () => {
    const a = [
      { path: "main.tex", content: "a" },
      { path: "refs.bib", content: "b" },
    ];
    const b = [a[1]!, a[0]!];
    expect(revisionHash(a)).toBe(revisionHash(b));
  });

  it("changes when one character of one document changes", () => {
    const base = [{ path: "main.tex", content: "hello" }];
    const changed = [{ path: "main.tex", content: "hellp" }];
    expect(revisionHash(base)).not.toBe(revisionHash(changed));
  });

  it("changes when a path changes but the content does not", () => {
    const a = [{ path: "main.tex", content: "x" }];
    const b = [{ path: "other.tex", content: "x" }];
    expect(revisionHash(a)).not.toBe(revisionHash(b));
  });

  it("matches the spec's literal `path || contentHash` concatenation", () => {
    const docs = [
      { path: "main.tex", content: "alpha" },
      { path: "refs.bib", content: null },
    ];
    const sorted = docs
      .slice()
      .sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
    const expected = sha256(
      sorted.map((d) => `${d.path}${contentHash(d.content)}`).join(""),
    );
    expect(revisionHash(docs)).toBe(expected);
  });

  it("separates a path/content boundary without a delimiter", () => {
    // `path || contentHash` is unambiguous because contentHash is fixed-width.
    const a = [{ path: "ab", content: "c" }];
    const b = [{ path: "a", content: "bc" }];
    expect(revisionHash(a)).not.toBe(revisionHash(b));
  });

  it("treats null and empty content the same", () => {
    const a = [{ path: "main.tex", content: null }];
    const b = [{ path: "main.tex", content: "" }];
    expect(revisionHash(a)).toBe(revisionHash(b));
  });

  it("returns a 64-character lowercase hex digest", () => {
    const digest = revisionHash([]);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});