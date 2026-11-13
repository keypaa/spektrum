import { describe, expect, it, vi } from "vitest";
import { EDITOR_CONTEXT_ITEMS, runEditorAction, wrapSelection } from "./commands";

function fakeEditor(selectedText = "Tiny") {
  const state = {
    selection: {
      // A real Monaco Selection carries both the Range and Selection shapes.
      startLineNumber: 2,
      startColumn: 5,
      endLineNumber: 2,
      endColumn: 9,
      selectionStartLineNumber: 2,
      selectionStartColumn: 5,
      positionLineNumber: 2,
      positionColumn: 9,
    },
  };
  const editor = {
    getSelection: () => state.selection,
    setSelection: (s: unknown) => {
      state.selection = s as typeof state.selection;
    },
    getModel: () => ({
      getValueInRange: () => selectedText,
      getLineCount: () => 3,
      getLineContent: () => "",
    }),
    executeEdits: vi.fn(),
    trigger: vi.fn(),
    getAction: vi.fn(() => ({ run: vi.fn() })),
  };
  return { editor: editor as never, state, executeEdits: editor.executeEdits, setSelection: editor.setSelection };
}

describe("EDITOR_CONTEXT_ITEMS", () => {
  it("equals §7.5's ten rows in three groups with the right shortcuts", () => {
    const rows = EDITOR_CONTEXT_ITEMS.map((i) => [i.label, i.shortcut ?? ""]);
    expect(rows).toEqual([
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
    ]);
    const groups = new Set(EDITOR_CONTEXT_ITEMS.map((i) => i.group));
    expect([...groups].sort()).toEqual([1, 2, 3]);
  });
});

describe("wrapSelection", () => {
  it("replaces the selection with before + text + after and keeps it selected", () => {
    const { editor, executeEdits, state } = fakeEditor("Tiny");
    wrapSelection(editor, "\\textbf{", "}");
    expect(executeEdits).toHaveBeenCalledTimes(1);
    const edits = executeEdits.mock.calls[0]![1] as Array<{ text: string }>;
    expect(edits[0]!.text).toBe("\\textbf{Tiny}");
    // The wrapped text stays selected (columns expand by the wrappers).
    expect(state.selection.selectionStartColumn).toBe(5);
    expect(state.selection.positionColumn).toBe(5 + "\\textbf{Tiny}".length);
  });
});

describe("runEditorAction", () => {
  it("runs a named editor action", () => {
    const { editor } = fakeEditor();
    runEditorAction(editor, "editor.action.formatDocument");
    expect((editor as unknown as { getAction: ReturnType<typeof vi.fn> }).getAction).toHaveBeenCalledWith(
      "editor.action.formatDocument",
    );
  });
});