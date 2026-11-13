import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTexcount } from "./stats";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "texcount",
);
const read = (name: string): string =>
  readFileSync(join(fixtures, `${name}.txt`), "utf8");

describe("parseTexcount", () => {
  it("parses the example document's summary", () => {
    const stats = parseTexcount(read("example"), []);
    expect(stats.wordsInText).toBe(206);
    expect(stats.wordsInHeaders).toBe(5);
    expect(stats.wordsOutsideText).toBe(0);
    expect(stats.headers).toBe(3);
    expect(stats.mathInline).toBe(1);
    expect(stats.mathDisplay).toBe(2);
    // No total-words line: words = text + headers + outside.
    expect(stats.words).toBe(211);
  });

  it("counts figures across all sources, not just the main file", () => {
    const main =
      "\\documentclass{article}\n\\begin{document}\n\\input{part}\n\\end{document}\n";
    const part =
      "Hello world.\n\\begin{figure}\\includegraphics{a.png}\\end{figure}\n";
    const stats = parseTexcount(read("multi"), [main, part]);
    expect(stats.wordsInText).toBe(13);
    expect(stats.wordsInHeaders).toBe(1);
    expect(stats.words).toBe(14);
    expect(stats.figures).toBe(1);
  });

  it("returns zeros when a field is absent", () => {
    const stats = parseTexcount("Total\n", []);
    expect(stats).toEqual({
      words: 0,
      wordsInText: 0,
      wordsInHeaders: 0,
      wordsOutsideText: 0,
      headers: 0,
      figures: 0,
      mathInline: 0,
      mathDisplay: 0,
    });
  });
});