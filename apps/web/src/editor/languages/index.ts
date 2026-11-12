// Language registration (spec §7.2/§7.3): LaTeX (Monarch + configuration +
// folding), BibTeX, CSV. `registerLanguages` is idempotent — the editor
// client calls it before the first model is created.

import type * as monaco from "monaco-editor";
import { LATEX_LANGUAGE, LATEX_CONFIGURATION } from "./latex";
import { BIBTEX_LANGUAGE } from "./bibtex";
import { CSV_LANGUAGE } from "./csv";
import { registerFolding } from "../folding";

export type EditorLanguage = "latex" | "bibtex" | "csv" | "plaintext";

export function languageForPath(path: string): EditorLanguage {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tex") || lower.endsWith(".cls") || lower.endsWith(".sty")) {
    return "latex";
  }
  if (lower.endsWith(".bib")) return "bibtex";
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return "csv";
  return "plaintext";
}

let registered = false;

export function registerLanguages(m: typeof monaco): void {
  if (registered) return;
  registered = true;

  const known = new Set(m.languages.getLanguages().map((l) => l.id));
  if (!known.has("latex")) m.languages.register({ id: "latex" });
  if (!known.has("bibtex")) m.languages.register({ id: "bibtex" });
  if (!known.has("csv")) m.languages.register({ id: "csv" });

  m.languages.setMonarchTokensProvider("latex", LATEX_LANGUAGE);
  m.languages.setLanguageConfiguration("latex", LATEX_CONFIGURATION);
  m.languages.setMonarchTokensProvider("bibtex", BIBTEX_LANGUAGE);
  m.languages.setMonarchTokensProvider("csv", CSV_LANGUAGE);

  registerFolding(m);
}