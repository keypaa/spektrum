// The BibTeX Monarch grammar, verbatim from zenno/recon/js/36qcv_qj-yoz-.js
// @793700 (`vc` in the bundle). The minifier's local aliases (`vu`) are
// inlined below.

import type { languages } from "monaco-editor";

const WORD = /[\p{L}\p{N}][\p{L}\p{N}_-]*/u;

export const BIBTEX_LANGUAGE: languages.IMonarchLanguage = {
  defaultToken: "",
  unicode: true,
  tokenPostfix: ".bibtex",
  displayName: "BibTeX",
  name: "bibtex",
  mimeTypes: ["text/x-bibtex", "application/x-bibtex"],
  fileExtensions: ["bib"],
  month: [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ],
  tokenizer: {
    root: [
      [/%.*$/, "comment"],
      [
        /(@[A-Za-z]+)(?:\s*)(\{)/,
        [
          "keyword",
          { token: "delimiter.curly", bracket: "@open", next: "@entryHead" },
        ],
      ],
    ],
    entryHead: [
      [/\}/, { token: "delimiter.curly", bracket: "@close", next: "@pop" }],
      [WORD, { token: "constant.citekey", next: "@entryKeyAndValues" }],
    ],
    entryKeyAndValues: [
      [/\s+/, "white"],
      [/,\s*/, "delimiter.comma"],
      [WORD, "string.key"],
      [/\s*=\s*/, { token: "delimiter.equals", next: "@afterEquals" }],
      [/\}/, { token: "@rematch", next: "@pop" }],
    ],
    afterEquals: [
      [/\{/, { token: "delimiter.curly", bracket: "@open", next: "@braceValue" }],
      [/\}/, { token: "delimiter.curly", bracket: "@close", next: "@pop" }],
      [/\s*,\s*/, { token: "@rematch", next: "@pop" }],
      [
        /[^,]*/,
        {
          cases: { "@month": "constant.predefined", "@default": "string" },
        },
      ],
    ],
    braceValue: [
      [/\}/, { token: "@rematch", next: "@pop" }],
      [/\{/, { token: "delimiter.curly", bracket: "@open", next: "@braceValueInner" }],
      [/\s+/, "white"],
      [
        /[^{}} ]*/,
        {
          cases: {
            "\\d*": "number",
            "\\d{4}-\\d{2}-\\d{2}": "number.date",
            "\\\\[a-zA-Z]+.*": { token: "@rematch", next: "@inlineCommand" },
            "@default": "string",
          },
        },
      ],
    ],
    inlineCommand: [
      [/\\[a-zA-Z]+/, "keyword"],
      [/./, { token: "@rematch", next: "@pop" }],
    ],
    braceValueInner: [
      [/\{/, { token: "delimiter.curly", bracket: "@open", next: "@braceValueInner" }],
      [/\}/, { token: "delimiter.curly", bracket: "@close", next: "@pop" }],
      [/\\[a-zA-Z]+/, "keyword"],
      [/./u, "string.quote"],
    ],
  },
};