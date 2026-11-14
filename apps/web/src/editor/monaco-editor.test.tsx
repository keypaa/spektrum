// @vitest-environment jsdom
import { createRef } from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@spektrum/shared/preferences";

const state = vi.hoisted(() => ({
  model: null as null | { pushEditOperations: ReturnType<typeof vi.fn> },
}));

vi.mock("@/editor/monaco-environment", () => {
  const model = {
    uri: { toString: () => "inmemory://spektrum/main.tex" },
    getValue: vi.fn(() => "a\nb\nc\n"),
    getFullModelRange: vi.fn(() => ({ startLineNumber: 1 })),
    pushEditOperations: vi.fn(),
    dispose: vi.fn(),
  };
  const editor = {
    setModel: vi.fn(),
    getModel: vi.fn(() => model),
    updateOptions: vi.fn(),
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
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