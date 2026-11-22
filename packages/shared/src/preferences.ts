// The user preferences object (spec §9.7), validated by a zod schema shared by
// the API (strict parse at the boundary) and the client (lenient merge of a
// stored row). The DB row is authoritative (D38): only `interfaceTheme` is
// mirrored to `crixet_light_mode_preference_v1` for the pre-paint script.

import { z } from "zod";
import { imageSupportSchema } from "./ai/images";

/** The §9.6 "Hide files from file tree" list, verbatim and in order. */
export const DEFAULT_HIDDEN_FILES: readonly string[] = [
  "*.aux", "*.log", "*.toc", "*.out", "*.fls", "*.fdb_latexmk", "*.synctex.gz",
  "*.gz", "*.dvi", "*.lof", "*.lot", "*.bit", "*.idx", "*.glo", "*.bbl", "*.blg",
  "*.ilg", "*.ind", "*.glg", "*.gls", "*.acr", "*.alg", "*.xdy", "*.xdv", "*.bak",
  "*.sav", "*.tmp", "*~", "*.swp", "*.swo", "*.snm", "*.nav", "*.vrb", "*.bcf",
  "*.run.xml", "*.spl", ".git", ".DS_Store", ".gitignore", "node_modules", ".next",
] as const;

const MAX_WORDS = 2000;
const MAX_CHARACTERS = 500;
const MAX_HIDDEN_FILES = 500;

const interfaceThemeSchema = z.enum(["system", "dark", "light"]);

/**
 * BYOK provider/model selection. `configured: false` means the server env
 * defaults (LLM_BASE_URL / LLM_MODEL_CHAT / LLM_MODEL_FAST) are still in use.
 * The API key itself is never stored here — it stays encrypted on the user row
 * and is write-only through /api/user/llm-key.
 */
export const llmConfigSchema = z
  .object({
    configured: z.boolean(),
    providerId: z.string().min(1).max(64),
    baseUrl: z.string().max(500),
    chatModel: z.string().max(200),
    fastModel: z.string().max(200),
    // Defaulted so rows written before this field existed still parse.
    imageSupport: imageSupportSchema.default("auto"),
  })
  .strict();

/**
 * Strict schema for the API boundary: an unknown key is a 400, not a silent
 * drop. `.strict()` is the difference between this and `mergePreferences`.
 */
export const preferencesSchema = z
  .object({
    interfaceTheme: interfaceThemeSchema,
    language: z.string().min(1).max(64),
    editorFontSize: z.number().int().min(11).max(20),
    autoFormatting: z.boolean(),
    realtimeCompilation: z.boolean(),
    vimMode: z.boolean(),
    equationHover: z.boolean(),
    disableWordWrap: z.boolean(),
    disableStickyScroll: z.boolean(),
    editorSpellcheckEnabled: z.boolean(),
    editorSpellcheckWords: z.array(z.string().min(1).max(128)).max(MAX_WORDS),
    editorUnicodeHighlightEnabled: z.boolean(),
    editorUnicodeInvisibleHighlightEnabled: z.boolean(),
    editorUnicodeAllowedCharacters: z
      .array(z.string().min(1).max(16))
      .max(MAX_CHARACTERS),
    pdfDarkMode: z.boolean(),
    pdfZoomShortcuts: z.boolean(),
    revealSidebarOnHover: z.boolean(),
    hiddenFiles: z.array(z.string().min(1).max(200)).max(MAX_HIDDEN_FILES),
    llm: llmConfigSchema,
  })
  .strict();

export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
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
};

function mergeOne<T>(
  value: unknown,
  fallback: T,
  parse: (v: unknown) => T | null,
): T {
  const parsed = parse(value);
  return parsed === null ? fallback : parsed;
}

/**
 * Merge a stored row over the defaults, field by field. A field that is absent
 * or invalid keeps its default; an unknown key is dropped, not rejected —
 * unlike the strict API schema. This is the read path: a schema change in the
 * DB must never crash the app.
 */
export function mergePreferences(value: unknown): Preferences {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_PREFERENCES, hiddenFiles: [...DEFAULT_HIDDEN_FILES] };
  }
  const v = value as Record<string, unknown>;
  return {
    interfaceTheme: mergeOne(v.interfaceTheme, DEFAULT_PREFERENCES.interfaceTheme, (x) =>
      interfaceThemeSchema.safeParse(x).success
        ? (x as Preferences["interfaceTheme"])
        : null,
    ),
    language: mergeOne(v.language, DEFAULT_PREFERENCES.language, (x) =>
      typeof x === "string" && x.length >= 1 && x.length <= 64 ? x : null,
    ),
    editorFontSize: mergeOne(v.editorFontSize, DEFAULT_PREFERENCES.editorFontSize, (x) =>
      typeof x === "number" && Number.isInteger(x) && x >= 11 && x <= 20 ? x : null,
    ),
    autoFormatting: mergeOne(v.autoFormatting, DEFAULT_PREFERENCES.autoFormatting, boolOrNull),
    realtimeCompilation: mergeOne(
      v.realtimeCompilation,
      DEFAULT_PREFERENCES.realtimeCompilation,
      boolOrNull,
    ),
    vimMode: mergeOne(v.vimMode, DEFAULT_PREFERENCES.vimMode, boolOrNull),
    equationHover: mergeOne(v.equationHover, DEFAULT_PREFERENCES.equationHover, boolOrNull),
    disableWordWrap: mergeOne(
      v.disableWordWrap,
      DEFAULT_PREFERENCES.disableWordWrap,
      boolOrNull,
    ),
    disableStickyScroll: mergeOne(
      v.disableStickyScroll,
      DEFAULT_PREFERENCES.disableStickyScroll,
      boolOrNull,
    ),
    editorSpellcheckEnabled: mergeOne(
      v.editorSpellcheckEnabled,
      DEFAULT_PREFERENCES.editorSpellcheckEnabled,
      boolOrNull,
    ),
    editorSpellcheckWords: mergeOne(
      v.editorSpellcheckWords,
      DEFAULT_PREFERENCES.editorSpellcheckWords,
      wordsOrNull,
    ),
    editorUnicodeHighlightEnabled: mergeOne(
      v.editorUnicodeHighlightEnabled,
      DEFAULT_PREFERENCES.editorUnicodeHighlightEnabled,
      boolOrNull,
    ),
    editorUnicodeInvisibleHighlightEnabled: mergeOne(
      v.editorUnicodeInvisibleHighlightEnabled,
      DEFAULT_PREFERENCES.editorUnicodeInvisibleHighlightEnabled,
      boolOrNull,
    ),
    editorUnicodeAllowedCharacters: mergeOne(
      v.editorUnicodeAllowedCharacters,
      DEFAULT_PREFERENCES.editorUnicodeAllowedCharacters,
      charactersOrNull,
    ),
    pdfDarkMode: mergeOne(v.pdfDarkMode, DEFAULT_PREFERENCES.pdfDarkMode, boolOrNull),
    pdfZoomShortcuts: mergeOne(
      v.pdfZoomShortcuts,
      DEFAULT_PREFERENCES.pdfZoomShortcuts,
      boolOrNull,
    ),
    revealSidebarOnHover: mergeOne(
      v.revealSidebarOnHover,
      DEFAULT_PREFERENCES.revealSidebarOnHover,
      boolOrNull,
    ),
    hiddenFiles: mergeOne(
      v.hiddenFiles,
      DEFAULT_PREFERENCES.hiddenFiles,
      hiddenFilesOrNull,
    ),
    llm: mergeOne(v.llm, DEFAULT_PREFERENCES.llm, (x) => {
      const parsed = llmConfigSchema.safeParse(x);
      return parsed.success ? parsed.data : null;
    }),
  };
}

function boolOrNull(x: unknown): boolean | null {
  return typeof x === "boolean" ? x : null;
}

function wordsOrNull(x: unknown): string[] | null {
  if (!Array.isArray(x) || x.length > MAX_WORDS) return null;
  if (!x.every((w) => typeof w === "string" && w.length >= 1 && w.length <= 128)) {
    return null;
  }
  return [...x];
}

function charactersOrNull(x: unknown): string[] | null {
  if (!Array.isArray(x) || x.length > MAX_CHARACTERS) return null;
  if (!x.every((c) => typeof c === "string" && c.length >= 1 && c.length <= 16)) {
    return null;
  }
  return [...x];
}

function hiddenFilesOrNull(x: unknown): string[] | null {
  if (!Array.isArray(x) || x.length > MAX_HIDDEN_FILES) return null;
  if (!x.every((p) => typeof p === "string" && p.length >= 1 && p.length <= 200)) {
    return null;
  }
  return [...x];
}