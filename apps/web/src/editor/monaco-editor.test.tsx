// @vitest-environment jsdom
import { createRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@spektrum/shared/preferences";

const state = vi.hoisted(() => ({
  model: null as null | { pushEditOperations: ReturnType<typeof vi.fn> },
  editor: null as null | {
    updateOptions: ReturnType<typeof vi.fn>;
    revealLineInCenter: ReturnType<typeof vi.fn>;
    setSelection: ReturnType<typeof vi.fn>;
  },
  selectionHandler: null as null | ((event: unknown) => void),
}));

vi.mock("@/editor/monaco-environment", () => {
  const model = {
    uri: { toString: () => "inmemory://spektrum/main.tex" },
    getValue: vi.fn(() => "a\nb\nc\n"),
    getFullModelRange: vi.fn(() => ({ startLineNumber: 1 })),
    pushEditOperations: vi.fn(),
    getPositionAt: vi.fn((pos: { lineNumber: number }) => ({
      lineNumber: pos.lineNumber,
    })),
    dispose: vi.fn(),
  };
  const editor = {
    setModel: vi.fn(),
    getModel: vi.fn(() => model),
    updateOptions: vi.fn(),
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeCursorSelection: vi.fn((handler: (event: unknown) => void) => {
      state.selectionHandler = handler;
      return { dispose: vi.fn() };
    }),
    setSelection: vi.fn(),
    pushUndoStop: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
    saveViewState: vi.fn(() => null),
    restoreViewState: vi.fn(),
    getPosition: vi.fn(() => null),
    setPosition: vi.fn(),
    revealPositionInCenter: vi.fn(),
    revealLineInCenter: vi.fn(),
    trigger: vi.fn(),
  };
  state.model = model;
  state.editor = editor;
  return {
    monaco: {
      Uri: { parse: (value: string) => ({ toString: () => value }) },
      editor: {
        create: vi.fn(() => editor),
        createModel: vi.fn(() => model),
        setTheme: vi.fn(),
      },
    },
    setupMonacoEnvironment: vi.fn(),
  };
});

vi.mock("@/editor/languages", () => ({
  registerLanguages: vi.fn(),
  languageForPath: () => "plaintext",
}));
vi.mock("@/editor/options", () => ({ createEditorOptions: () => ({}) }));

import { MonacoEditor, type MonacoEditorHandle } from "./monaco-editor";

afterEach(() => vi.clearAllMocks());

const HUNKS = [
  { oldStart: 2, oldLines: 1, newStart: 2, newLines: 1, lines: ["-b", "+B"] },
];

describe("MonacoEditor selection", () => {
  const props = {
    path: "main.tex",
    value: "a\nb\nc\n",
    language: "latex",
    theme: "crixet" as const,
    preferences: DEFAULT_PREFERENCES,
    onChange: vi.fn(),
  };

  it("reports 1-based lines for a non-empty selection and null for an empty one", () => {
    const onSelectionChange = vi.fn();
    render(<MonacoEditor {...props} onSelectionChange={onSelectionChange} />);
    act(() => {
      state.selectionHandler!({
        selection: {
          isEmpty: () => false,
          getStartPosition: () => ({ lineNumber: 55, column: 1 }),
          getEndPosition: () => ({ lineNumber: 112, column: 4 }),
        },
      });
    });
    expect(onSelectionChange).toHaveBeenCalledWith({
      startLine: 55,
      endLine: 112,
    });
    act(() => {
      state.selectionHandler!({ selection: { isEmpty: () => true } });
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
  });

  it("reveals and selects a whole line range", () => {
    const ref = createRef<MonacoEditorHandle>();
    render(<MonacoEditor {...props} ref={ref} />);
    ref.current!.revealRange(55, 112);
    expect(state.editor!.revealLineInCenter).toHaveBeenCalledWith(55);
    expect(state.editor!.setSelection).toHaveBeenCalledWith(
      expect.objectContaining({ startLineNumber: 55, endLineNumber: 112 }),
    );
  });
});

describe("MonacoEditor loading gate", () => {
  it("applies readOnly when the document has not loaded yet", () => {
    render(
      <MonacoEditor
        path="main.tex"
        value=""
        language="latex"
        theme="crixet"
        preferences={DEFAULT_PREFERENCES}
        readOnly
        onChange={vi.fn()}
      />,
    );
    // Typing into the empty placeholder model would replace the real document
    // with whatever was typed, so the editor must be read-only until load.
    expect(state.editor!.updateOptions).toHaveBeenCalledWith({ readOnly: true });
  });

  it("is editable once readOnly is false", () => {
    const view = render(
      <MonacoEditor
        path="main.tex"
        value=""
        language="latex"
        theme="crixet"
        preferences={DEFAULT_PREFERENCES}
        readOnly
        onChange={vi.fn()}
      />,
    );
    view.rerender(
      <MonacoEditor
        path="main.tex"
        value="loaded"
        language="latex"
        theme="crixet"
        preferences={DEFAULT_PREFERENCES}
        readOnly={false}
        onChange={vi.fn()}
      />,
    );
    expect(state.editor!.updateOptions).toHaveBeenLastCalledWith({ readOnly: false });
  });
});

describe("MonacoEditor handle", () => {
  it("applyHunks applies the hunks, pushes undo and does not schedule a save", () => {
    const ref = createRef<MonacoEditorHandle>();
    const onChange = vi.fn();
    render(
      <MonacoEditor
        ref={ref}
        path="main.tex"
        value="a\nb\nc\n"
        language="latex"
        theme="crixet"
        preferences={DEFAULT_PREFERENCES}
        onChange={onChange}
      />,
    );

    ref.current!.applyHunks("main.tex", HUNKS);

    const model = state.model!;
    expect(model.pushEditOperations).toHaveBeenCalled();
    expect(model.pushEditOperations.mock.calls[0]![1][0].text).toBe("a\nB\nc\n");
    expect(onChange).not.toHaveBeenCalled();
  });
});