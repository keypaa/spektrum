/** The shortcuts dialog rows (§7.5's ten, plus Find/Save — D43). */
export const SHORTCUT_ROWS: ReadonlyArray<readonly [label: string, shortcut: string]> = [
  ["Go to PDF", "Ctrl+J"],
  ["Change All Occurrences", "Ctrl+F2"],
  ["Format Document", "Ctrl+Shift+I"],
  ["Bold text", "Ctrl+B"],
  ["Italic text", "Ctrl+I"],
  ["Cut", ""],
  ["Copy", ""],
  ["Paste", ""],
  ["Command Palette", ""],
  ["File Search", "F1"],
  ["Find", "Ctrl+F"],
  ["Save", "Ctrl+S"],
] as const;