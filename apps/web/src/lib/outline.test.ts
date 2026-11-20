import { describe, expect, it } from "vitest";
import { parseOutline } from "./outline";

describe("parseOutline", () => {
  it("builds a nested tree from LaTeX section commands", () => {
    const text = [
      "\\documentclass{article}",
      "\\section{Introduction}",
      "\\subsection{The simulator}",
      "body",
      "\\subsection{Notation}",
      "\\section{Probabilistic study}",
      "\\subsection{Distributions}",
      "\\end{document}",
    ].join("\n");
    expect(parseOutline(text)).toEqual([
      {
        id: "l2",
        title: "Introduction",
        line: 2,
        level: 2,
        children: [
          { id: "l3", title: "The simulator", line: 3, level: 3, children: [] },
          { id: "l5", title: "Notation", line: 5, level: 3, children: [] },
        ],
      },
      {
        id: "l6",
        title: "Probabilistic study",
        line: 6,
        level: 2,
        children: [
          { id: "l7", title: "Distributions", line: 7, level: 3, children: [] },
        ],
      },
    ]);
  });

  it("handles starred sections and optional arguments", () => {
    expect(
      parseOutline("\\section*{What is Spektrum?}\n\\subsection[short]{Long title}"),
    ).toEqual([
      {
        id: "l1",
        title: "What is Spektrum?",
        line: 1,
        level: 2,
        children: [
          {
            id: "l2",
            title: "Long title",
            line: 2,
            level: 3,
            children: [],
          },
        ],
      },
    ]);
  });

  it("returns nothing for a document without sections", () => {
    expect(parseOutline("hello\nworld")).toEqual([]);
  });
});
