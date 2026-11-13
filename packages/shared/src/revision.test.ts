import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { contentHash, revisionHash, type RevisionDocument } from "./revision";

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

const doc = (
  path: string,
  content: string | null,
  blobKey: string | null = null,
): RevisionDocument => ({ path, content, blobKey });

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
    const docs = [doc("main.tex", "a"), doc("refs.bib", "b")];
    expect(revisionHash(docs)).toBe(revisionHash(docs));
  });

  it("does not depend on input order", () => {
    const a = [doc("main.tex", "a"), doc("refs.bib", "b")];
    const b = [a[1]!, a[0]!];
    expect(revisionHash(a)).toBe(revisionHash(b));
  });

  it("changes when one character of one document changes", () => {
    const base = [doc("main.tex", "hello")];
    const changed = [doc("main.tex", "hellp")];
    expect(revisionHash(base)).not.toBe(revisionHash(changed));
  });

  it("changes when a path changes but the content does not", () => {
    const a = [doc("main.tex", "x")];
    const b = [doc("other.tex", "x")];
    expect(revisionHash(a)).not.toBe(revisionHash(b));
  });

  it("matches the spec's literal `path || contentHash` concatenation", () => {
    const docs = [doc("main.tex", "alpha"), doc("refs.bib", null)];
    const sorted = docs
      .slice()
      .sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
    const expected = sha256(
      sorted
        .map((d) => `${d.path}${contentHash(d.content ?? d.blobKey)}`)
        .join(""),
    );
    expect(revisionHash(docs)).toBe(expected);
  });

  it("separates a path/content boundary without a delimiter", () => {
    const a = [doc("ab", "c")];
    const b = [doc("a", "bc")];
    expect(revisionHash(a)).not.toBe(revisionHash(b));
  });

  it("treats null and empty content the same", () => {
    const a = [doc("main.tex", null)];
    const b = [doc("main.tex", "")];
    expect(revisionHash(a)).toBe(revisionHash(b));
  });

  it("changes when a blob document's key changes", () => {
    const a = [doc("diagram.jpg", null, "a".repeat(64))];
    const b = [doc("diagram.jpg", null, "b".repeat(64))];
    expect(revisionHash(a)).not.toBe(revisionHash(b));
  });

  it("returns a 64-character lowercase hex digest", () => {
    expect(revisionHash([])).toMatch(/^[0-9a-f]{64}$/);
  });
});