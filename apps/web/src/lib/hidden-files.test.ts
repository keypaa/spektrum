import { describe, expect, it } from "vitest";
import { matchHiddenFile } from "./hidden-files";

describe("matchHiddenFile", () => {
  it("matches nothing for an empty list", () => {
    expect(matchHiddenFile("main.aux", [])).toBe(false);
  });

  it("matches a suffix glob against the whole path", () => {
    expect(matchHiddenFile("main.aux", ["*.aux"])).toBe(true);
    expect(matchHiddenFile("notes/main.aux", ["*.aux"])).toBe(true);
    expect(matchHiddenFile("notes.tex", ["*.aux"])).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(matchHiddenFile("MAIN.AUX", ["*.aux"])).toBe(false);
  });

  it("matches a trailing-character glob", () => {
    expect(matchHiddenFile("main.tex~", ["*~"])).toBe(true);
    expect(matchHiddenFile("main.tex", ["*~"])).toBe(false);
  });

  it("matches an exact segment, not a prefix", () => {
    expect(matchHiddenFile(".git", [".git"])).toBe(true);
    expect(matchHiddenFile("node_modules", ["node_modules"])).toBe(true);
    expect(matchHiddenFile(".gitignore", [".git"])).toBe(false);
    expect(matchHiddenFile("config/.git", [".git"])).toBe(false);
  });

  it("anchors a suffix pattern at the end", () => {
    expect(matchHiddenFile("main.tex.bak", ["*.tex"])).toBe(false);
    expect(matchHiddenFile("main.tex", ["*.tex"])).toBe(true);
  });

  it("matches a multi-star pattern", () => {
    expect(matchHiddenFile("main.synctex.gz", ["*.synctex.gz"])).toBe(true);
    expect(matchHiddenFile("main.gz", ["*.synctex.gz"])).toBe(false);
  });

  it("matches a leading glob", () => {
    expect(matchHiddenFile(".DS_Store", [".DS_Store"])).toBe(true);
  });

  it("matches when any pattern in the list matches", () => {
    const globs = ["*.aux", "*.log", ".git"];
    expect(matchHiddenFile("main.log", globs)).toBe(true);
    expect(matchHiddenFile(".git", globs)).toBe(true);
    expect(matchHiddenFile("main.tex", globs)).toBe(false);
  });
});