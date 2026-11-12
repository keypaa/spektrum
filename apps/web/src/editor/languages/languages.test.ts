import { describe, expect, it } from "vitest";
import { registerLanguages, languageForPath } from "./index";
import { BIBTEX_LANGUAGE } from "./bibtex";
import { CSV_LANGUAGE } from "./csv";
import { LATEX_LANGUAGE } from "./latex";

describe("languageForPath", () => {
  it("maps extensions to language ids", () => {
    expect(languageForPath("main.tex")).toBe("latex");
    expect(languageForPath("main.cls")).toBe("latex");
    expect(languageForPath("main.sty")).toBe("latex");
    expect(languageForPath("refs.bib")).toBe("bibtex");
    expect(languageForPath("data.csv")).toBe("csv");
    expect(languageForPath("diagram.png")).toBe("plaintext");
    expect(languageForPath("notes.txt")).toBe("plaintext");
  });
});

describe("the grammars are valid Monarch objects", () => {
  it("latex has a tokenizer with root rules", () => {
    const root = LATEX_LANGUAGE.tokenizer.root as unknown[];
    expect(Array.isArray(root)).toBe(true);
    expect(root.length).toBeGreaterThan(0);
    expect(LATEX_LANGUAGE.name).toBe("latex");
    expect(LATEX_LANGUAGE.lineComment).toBe("% ");
  });

  it("bibtex has a tokenizer with root rules", () => {
    expect(Array.isArray(BIBTEX_LANGUAGE.tokenizer.root)).toBe(true);
    expect(BIBTEX_LANGUAGE.name).toBe("bibtex");
  });

  it("csv has a tokenizer with root rules", () => {
    expect(Array.isArray(CSV_LANGUAGE.tokenizer.root)).toBe(true);
    expect(CSV_LANGUAGE.name).toBe("csv");
  });
});

describe("the LaTeX language configuration", () => {
  it("has % line comments and auto-closing pairs for { } [ ] ( ) $ $$", async () => {
    const { LATEX_CONFIGURATION } = await import("./latex");
    expect(LATEX_CONFIGURATION.comments).toEqual({ lineComment: "%" });
    const pairs = (LATEX_CONFIGURATION.autoClosingPairs ?? []).map((p) =>
      Array.isArray(p) ? p.join("") : `${p.open}${p.close}`,
    );
    for (const pair of ["{}", "[]", "()", "$$", "$$$$"]) {
      expect(pairs).toContain(pair);
    }
  });
});

describe("registerLanguages", () => {
  it("is idempotent (registers once)", async () => {
    const fake = {
      languages: {
        register: () => [],
        getLanguages: () => [],
        setMonarchTokensProvider: () => null,
        setLanguageConfiguration: () => null,
        registerFoldingRangeProvider: () => null,
      },
    } as unknown as Parameters<typeof registerLanguages>[0];
    expect(() => {
      registerLanguages(fake);
      registerLanguages(fake);
    }).not.toThrow();
  });
});