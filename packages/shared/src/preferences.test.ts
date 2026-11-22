import { describe, expect, it } from "vitest";
import {
  DEFAULT_HIDDEN_FILES,
  DEFAULT_PREFERENCES,
  mergePreferences,
  preferencesSchema,
} from "./preferences";

describe("DEFAULT_HIDDEN_FILES", () => {
  it("is the §9.6 list verbatim, 41 entries", () => {
    expect(DEFAULT_HIDDEN_FILES).toHaveLength(41);
    expect([...DEFAULT_HIDDEN_FILES]).toEqual([
      "*.aux", "*.log", "*.toc", "*.out", "*.fls", "*.fdb_latexmk", "*.synctex.gz",
      "*.gz", "*.dvi", "*.lof", "*.lot", "*.bit", "*.idx", "*.glo", "*.bbl", "*.blg",
      "*.ilg", "*.ind", "*.glg", "*.gls", "*.acr", "*.alg", "*.xdy", "*.xdv", "*.bak",
      "*.sav", "*.tmp", "*~", "*.swp", "*.swo", "*.snm", "*.nav", "*.vrb", "*.bcf",
      "*.run.xml", "*.spl", ".git", ".DS_Store", ".gitignore", "node_modules", ".next",
    ]);
  });
});

describe("DEFAULT_PREFERENCES", () => {
  it("matches the §9.7 defaults", () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      interfaceTheme: "system",
      language: "system",
      editorFontSize: 13,
      autoFormatting: false,
      realtimeCompilation: true,
      vimMode: false,
      equationHover: true,
      disableWordWrap: false,
      disableStickyScroll: false,
      editorSpellcheckEnabled: false,
      editorSpellcheckWords: [],
      editorUnicodeHighlightEnabled: true,
      editorUnicodeInvisibleHighlightEnabled: true,
      editorUnicodeAllowedCharacters: [],
      pdfDarkMode: false,
      pdfZoomShortcuts: true,
      revealSidebarOnHover: true,
      hiddenFiles: [...DEFAULT_HIDDEN_FILES],
      llm: {
        configured: false,
        providerId: "kilo",
        baseUrl: "",
        chatModel: "",
        fastModel: "",
        imageSupport: "auto",
      },
    });
  });
});

describe("mergePreferences", () => {
  it("returns the defaults for an empty or non-object value", () => {
    expect(mergePreferences({})).toEqual(DEFAULT_PREFERENCES);
    expect(mergePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(mergePreferences("nope")).toEqual(DEFAULT_PREFERENCES);
  });

  it("merges stored LLM settings without losing the other defaults", () => {
    const merged = mergePreferences({
      llm: {
        configured: true,
        providerId: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        chatModel: "openai/gpt-4o",
        fastModel: "google/gemini-2.5-flash",
      },
    });
    expect(merged.llm).toEqual({
      configured: true,
      providerId: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      chatModel: "openai/gpt-4o",
      fastModel: "google/gemini-2.5-flash",
      imageSupport: "auto",
    });
    expect(merged.editorFontSize).toBe(DEFAULT_PREFERENCES.editorFontSize);
    // A malformed stored sub-object must not crash the read path.
    expect(mergePreferences({ llm: { providerId: 42 } }).llm).toEqual(
      DEFAULT_PREFERENCES.llm,
    );
  });

  it("rejects unknown keys in the LLM settings at the API boundary", () => {
    expect(
      preferencesSchema.safeParse({
        ...DEFAULT_PREFERENCES,
        llm: { ...DEFAULT_PREFERENCES.llm, surprise: true },
      }).success,
    ).toBe(false);
  });

  it("defaults imageSupport to auto for rows stored before the field existed", () => {
    const merged = mergePreferences({
      llm: {
        configured: true,
        providerId: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        chatModel: "openai/gpt-4o",
        fastModel: "google/gemini-2.5-flash",
      },
    });
    expect(merged.llm.imageSupport).toBe("auto");
    expect(merged.llm.chatModel).toBe("openai/gpt-4o");
  });

  it("keeps a valid stored imageSupport override", () => {
    expect(
      mergePreferences({ llm: { ...DEFAULT_PREFERENCES.llm, imageSupport: "off" } })
        .llm.imageSupport,
    ).toBe("off");
  });

  it("merges a stored partial key-by-key", () => {
    const merged = mergePreferences({ editorFontSize: 15, vimMode: true });
    expect(merged.editorFontSize).toBe(15);
    expect(merged.vimMode).toBe(true);
    expect(merged.realtimeCompilation).toBe(DEFAULT_PREFERENCES.realtimeCompilation);
    expect(merged.hiddenFiles).toEqual(DEFAULT_PREFERENCES.hiddenFiles);
  });

  it("falls back to the default for an invalid field", () => {
    const merged = mergePreferences({
      interfaceTheme: "neon",
      editorFontSize: 99,
      editorSpellcheckWords: "not-an-array",
      hiddenFiles: "not-an-array",
      language: "system",
    });
    expect(merged.interfaceTheme).toBe(DEFAULT_PREFERENCES.interfaceTheme);
    expect(merged.editorFontSize).toBe(DEFAULT_PREFERENCES.editorFontSize);
    expect(merged.editorSpellcheckWords).toEqual([]);
    expect(merged.hiddenFiles).toEqual(DEFAULT_PREFERENCES.hiddenFiles);
  });

  it("drops unknown keys instead of throwing", () => {
    const merged = mergePreferences({
      vimMode: true,
      aKeyFromTheFuture: "oops",
    });
    expect(merged.vimMode).toBe(true);
    expect((merged as Record<string, unknown>).aKeyFromTheFuture).toBeUndefined();
  });

  it("keeps a valid stored array when it is within bounds", () => {
    const merged = mergePreferences({ hiddenFiles: ["*.aux"] });
    expect(merged.hiddenFiles).toEqual(["*.aux"]);
  });
});

describe("preferencesSchema", () => {
  it("accepts the full defaults object", () => {
    expect(preferencesSchema.parse(DEFAULT_PREFERENCES)).toEqual(DEFAULT_PREFERENCES);
  });

  it("rejects an unknown key at the API boundary", () => {
    expect(() =>
      preferencesSchema.parse({ ...DEFAULT_PREFERENCES, bogus: 1 }),
    ).toThrow();
  });

  it("rejects an out-of-range font size", () => {
    expect(() =>
      preferencesSchema.parse({ ...DEFAULT_PREFERENCES, editorFontSize: 99 }),
    ).toThrow();
  });

  it("rejects an unknown theme", () => {
    expect(() =>
      preferencesSchema.parse({ ...DEFAULT_PREFERENCES, interfaceTheme: "neon" }),
    ).toThrow();
  });

  it("rejects an unknown imageSupport override", () => {
    expect(() =>
      preferencesSchema.parse({
        ...DEFAULT_PREFERENCES,
        llm: { ...DEFAULT_PREFERENCES.llm, imageSupport: "maybe" },
      }),
    ).toThrow();
  });

  it("rejects an over-long word list", () => {
    const words = Array.from({ length: 2001 }, (_, i) => `w${i}`);
    expect(() =>
      preferencesSchema.parse({ ...DEFAULT_PREFERENCES, editorSpellcheckWords: words }),
    ).toThrow();
  });

  it("rejects an over-long allowed-character list", () => {
    const chars = Array.from({ length: 501 }, (_, i) => String.fromCharCode(0x100 + i));
    expect(() =>
      preferencesSchema.parse({
        ...DEFAULT_PREFERENCES,
        editorUnicodeAllowedCharacters: chars,
      }),
    ).toThrow();
  });

  it("rejects a non-integer font size", () => {
    expect(() =>
      preferencesSchema.parse({ ...DEFAULT_PREFERENCES, editorFontSize: 13.5 }),
    ).toThrow();
  });
});