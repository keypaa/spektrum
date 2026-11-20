import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BLANK_MAIN_TEX, EXAMPLE_MAIN_TEX } from "./templates";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Walk up from this file until the repo root (the one holding `zenno/`). */
function repoRoot(): string {
  let dir = HERE;
  for (;;) {
    if (existsSync(join(dir, "zenno", "recon", "extracted"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("repo root not found from " + HERE);
    dir = parent;
  }
}

const ROOT = repoRoot();
const EXTRACTED = join(ROOT, "zenno", "recon", "extracted");

describe("BLANK_MAIN_TEX", () => {
  it("is byte-for-byte the spec §7.6 block", () => {
    const spec = readFileSync(
      join(ROOT, "zenno", "specs", "2026-11-07-spektrum-design.md"),
      "utf8",
    );
    const start = spec.indexOf("### 7.6 Document templates");
    const fence = spec.indexOf("```latex", start) + "```latex\n".length;
    const end = spec.indexOf("```", fence);
    expect(BLANK_MAIN_TEX).toBe(spec.slice(fence, end));
  });

  it("matches zenno/recon/extracted/blank-main.tex", () => {
    expect(BLANK_MAIN_TEX).toBe(
      readFileSync(join(EXTRACTED, "blank-main.tex"), "utf8"),
    );
  });

  it("starts with \\documentclass and ends with a single newline", () => {
    expect(BLANK_MAIN_TEX.startsWith("\\documentclass[11pt]{article}\n")).toBe(true);
    expect(BLANK_MAIN_TEX.endsWith("\\end{document}\n")).toBe(true);
    expect(BLANK_MAIN_TEX.endsWith("\n\n")).toBe(false);
  });
});

describe("EXAMPLE_MAIN_TEX", () => {
  it("uses Spektrum branding instead of the captured Prism copy", () => {
    expect(EXAMPLE_MAIN_TEX).toContain("\\section*{What is Spektrum?}");
    expect(EXAMPLE_MAIN_TEX).toContain("\\textbf{Spektrum} is an AI-powered");
    expect(EXAMPLE_MAIN_TEX).toContain("includes AI-powered assistance");
    expect(EXAMPLE_MAIN_TEX).not.toContain("Prism");
    expect(EXAMPLE_MAIN_TEX).not.toContain("OpenAI");
    expect(EXAMPLE_MAIN_TEX).not.toContain("ChatGPT");
  });

  it("starts with \\documentclass and ends with \\end{document}", () => {
    expect(EXAMPLE_MAIN_TEX.startsWith("\\documentclass[11pt]{article}\n")).toBe(true);
    expect(EXAMPLE_MAIN_TEX.endsWith("\\end{document}\n")).toBe(true);
  });

  it("contains the demo content the folding and grammar tasks rely on", () => {
    expect(EXAMPLE_MAIN_TEX).toContain("``Add the equation");
    expect(EXAMPLE_MAIN_TEX).toContain("\\begin{tikzcd}");
    expect(EXAMPLE_MAIN_TEX).toContain(
      "\\includegraphics[width=\\linewidth]{diagram.jpg}",
    );
    expect(EXAMPLE_MAIN_TEX).toContain("\\section*{Features}");
    expect(EXAMPLE_MAIN_TEX).toContain("\\begin{multicols}{2}");
  });

  it("has no leftover template interpolation", () => {
    expect(EXAMPLE_MAIN_TEX).not.toContain("${");
  });
});