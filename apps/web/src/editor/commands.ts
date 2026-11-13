// Editor commands (spec §7.5): the custom context menu's actions.

import type { editor } from "monaco-editor";

export interface ContextItem {
  id: string;
  label: string;
  shortcut?: string;
  group: 1 | 2 | 3;
}

/** §7.5's ten rows, verbatim, in three groups (D43 adds nothing here). */
export const EDITOR_CONTEXT_ITEMS: ReadonlyArray<ContextItem> = [
  { id: "go-to-pdf", label: "Go to PDF", shortcut: "Ctrl+J", group: 1 },
  { id: "change-all", label: "Change All Occurrences", shortcut: "Ctrl+F2", group: 1 },
  { id: "format", label: "Format Document", shortcut: "Ctrl+Shift+I", group: 1 },
  { id: "bold", label: "Bold text", shortcut: "Ctrl+B", group: 1 },
  { id: "italic", label: "Italic text", shortcut: "Ctrl+I", group: 1 },
  { id: "cut", label: "Cut", group: 2 },
  { id: "copy", label: "Copy", group: 2 },
  { id: "paste", label: "Paste", group: 2 },
  { id: "command-palette", label: "Command Palette", group: 3 },
  { id: "file-search", label: "File Search", shortcut: "F1", group: 3 },
] as const;

/** Replace the selection with `before + selected + after`, keeping it selected. */
export function wrapSelection(
  ed: editor.IStandaloneCodeEditor,
  before: string,
  after: string,
): void {
  const selection = ed.getSelection();
  const model = ed.getModel();
  if (!selection || !model) return;
  const text = model.getValueInRange(selection);
  const replacement = `${before}${text}${after}`;
  ed.executeEdits("spektrum-wrap", [
    { range: selection, text: replacement, forceMoveMarkers: true },
  ]);
  // Keep the wrapped text selected: expand by the wrappers on each side.
  const endColumn = selection.endColumn + before.length + after.length;
  ed.setSelection({
    selectionStartLineNumber: selection.startLineNumber,
    selectionStartColumn: selection.startColumn,
    positionLineNumber: selection.endLineNumber,
    positionColumn: endColumn,
  });
}

export function runEditorAction(ed: editor.IStandaloneCodeEditor, action: string): void {
  ed.getAction(action)?.run();
}

export async function pasteFromClipboard(ed: editor.IStandaloneCodeEditor): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    const selection = ed.getSelection();
    if (!selection || !text) return;
    ed.executeEdits("spektrum-paste", [
      { range: selection, text, forceMoveMarkers: true },
    ]);
  } catch {
    // Clipboard permission denied; nothing to paste.
  }
}