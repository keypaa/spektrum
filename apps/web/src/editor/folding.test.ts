import { describe, expect, it } from "vitest";
import {
  environmentFolds,
  regionFolds,
  sectionFolds,
} from "./folding";

const lines = (s: string) => s.split("\n");

describe("regionFolds", () => {
  it("folds % { … % } as a region", () => {
    expect(regionFolds(lines("% {\nhello\n% }"))).toEqual([
      { start: 1, end: 3, kind: "region" },
    ]);
  });

  it("folds %{ … %} as a region", () => {
    expect(regionFolds(lines("%{\nhello\n%}"))).toEqual([
      { start: 1, end: 3, kind: "region" },
    ]);
  });

  it("produces two ranges for nested regions", () => {
    expect(regionFolds(lines("% {\n% {\nx\n% }\n% }"))).toEqual([
      { start: 1, end: 5, kind: "region" },
      { start: 2, end: 4, kind: "region" },
    ]);
  });

  it("emits nothing for an unclosed region", () => {
    expect(regionFolds(lines("% {\nhello"))).toEqual([]);
  });
});

describe("sectionFolds", () => {
  it("folds a section to the line before the next same/higher section", () => {
    expect(
      sectionFolds(lines("\\section{A}\nbody\n\\section{B}\nend")),
    ).toEqual([{ start: 1, end: 2, kind: "section" }]);
  });

  it("nests a subsection inside its section", () => {
    const ranges = sectionFolds(
      lines("\\section{A}\n\\subsection{B}\nx\n\\section{C}"),
    );
    expect(ranges).toContainEqual({ start: 1, end: 3, kind: "section" });
    expect(ranges).toContainEqual({ start: 2, end: 3, kind: "section" });
  });

  it("folds documentclass..end{document} as one section", () => {
    const ranges = sectionFolds(
      lines("\\documentclass{article}\n\\begin{document}\n\\end{document}"),
    );
    expect(ranges).toContainEqual({ start: 1, end: 3, kind: "section" });
  });

  it("emits nothing for an unclosed section", () => {
    expect(sectionFolds(lines("\\section{A}\nbody"))).toEqual([]);
  });

  it("never crashes on empty input", () => {
    expect(sectionFolds([])).toEqual([]);
  });
});

describe("environmentFolds", () => {
  it("folds itemize, begingroup and region markers", () => {
    expect(
      environmentFolds(lines("\\begin{itemize}\nx\n\\end{itemize}")),
    ).toEqual([{ start: 1, end: 3, kind: "environment" }]);
    expect(environmentFolds(lines("\\begingroup\nx\n\\endgroup"))).toEqual([
      { start: 1, end: 3, kind: "environment" },
    ]);
    expect(environmentFolds(lines("% Region\nx\n% Endregion"))).toEqual([
      { start: 1, end: 3, kind: "environment" },
    ]);
  });

  it("emits nothing for an unclosed environment", () => {
    expect(environmentFolds(lines("\\begin{itemize}\nx"))).toEqual([]);
  });
});