// The CSV Monarch grammar, verbatim from zenno/recon/js/36qcv_qj-yoz-.js
// @795351 (`vd` in the bundle).

import type { languages } from "monaco-editor";

export const CSV_LANGUAGE: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".csv",
  displayName: "CSV",
  name: "csv",
  mimeTypes: ["text/csv", "text/tab-separated-values"],
  fileExtensions: ["csv", "tsv"],
  tokenizer: {
    root: [
      [/\s+/, "white"],
      [/"([^"\\]|"")*"?/, "string"],
      [/[,;\t]/, "delimiter"],
      [/[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
      [/[^,;\t\r\n]+/, "identifier"],
    ],
  },
};