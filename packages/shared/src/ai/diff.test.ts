import { structuredPatch } from "diff";
import { describe, expect, it } from "vitest";
import { applyHunks, type DiffHunk } from "./diff";

const hunksFrom = (oldText: string, newText: string): DiffHunk[] =>
  structuredPatch("f", "f", oldText, newText, "", "").hunks;

describe("applyHunks", () => {
  it("applies a single hunk", () => {
    expect(applyHunks("a\nb\nc\n", hunksFrom("a\nb\nc\n", "a\nB\nc\n"))).toBe(
      "a\nB\nc\n",
    );
  });

  it("throws when the context no longer matches", () => {
    const hunks = hunksFrom("a\nb\nc\n", "a\nB\nc\n");
    expect(() => applyHunks("a\nx\nc\n", hunks)).toThrow(/does not match/);
  });

  it("is the inverse of structuredPatch for a multi-hunk edit", () => {
    const oldText = "one\ntwo\nthree\nfour\nfive\nsix\n";
    const newText = "ONE\ntwo\nthree\nfour\nFIVE\nsix\n";
    expect(applyHunks(oldText, hunksFrom(oldText, newText))).toBe(newText);
  });

  it("inserts without consuming when oldLines is 0", () => {
    const hunk: DiffHunk = {
      oldStart: 1,
      oldLines: 0,
      newStart: 1,
      newLines: 1,
      lines: ["+X"],
    };
    expect(applyHunks("a\nb\n", [hunk])).toBe("X\na\nb\n");
  });

  it("round-trips a file with no trailing newline", () => {
    const oldText = "a\nb";
    const newText = "a\nB";
    expect(applyHunks(oldText, hunksFrom(oldText, newText))).toBe(newText);
  });
});