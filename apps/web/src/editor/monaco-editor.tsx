"use client";

// The Monaco editor island (spec §7.1–7.3). Created once per mount; documents
// are models keyed by their encoded path (`inmemory://spektrum/...`), swapped
// on `path` change with view-state save/restore. Preference changes go
// through `editor.updateOptions`; value changes through the imperative handle,
// never through re-creation.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { editor } from "monaco-editor";
import type { Preferences } from "@spektrum/shared/preferences";
import { applyHunks as applyHunksToText, type DiffHunk } from "@spektrum/shared/ai/diff";
import { monaco, setupMonacoEnvironment } from "./monaco-environment";
import { registerLanguages, languageForPath } from "./languages";
import { createEditorOptions } from "./options";

export interface MonacoEditorHandle {
  getValue(): string;
  setValue(value: string): void;
  /** Replace the content without scheduling a save (loading a document,
   *  conflict recovery — the content comes from the server). */
  loadValue(value: string): void;
  /** Apply jsdiff hunks to a document model, as one undo stop, without
   *  scheduling a save (the caller persists explicitly). */
  applyHunks(path: string, hunks: DiffHunk[]): void;
  focus(): void;
  getPosition(): { lineNumber: number; column: number } | null;
  setPosition(position: { lineNumber: number; column: number }): void;
  trigger(action: string): void;
  revealLine(line: number): void;
  /** Reveal and select a whole 1-based, inclusive line range. */
  revealRange(startLine: number, endLine: number): void;
  getEditor(): editor.IStandaloneCodeEditor | null;
}

export interface MonacoEditorProps {
  path: string;
  value: string;
  language: string;
  theme: "crixet" | "crixet-light";
  preferences: Preferences;
  /** True until the document's content has been loaded: typing into the empty
   *  placeholder model would otherwise replace the real document. */
  readOnly?: boolean;
  onChange(value: string): void;
  /** Cursor moved to a 1-based line (SyncTeX forward sync). */
  onCursorChange?(line: number): void;
  /** Selection changed; null means the user clicked without selecting. */
  onSelectionChange?(range: { startLine: number; endLine: number } | null): void;
  onReady?(): void;
  /** Right-click inside the editor (viewport coordinates). */
  onContextMenu?(point: { x: number; y: number }): void;
}

function modelUri(path: string) {
  return monaco.Uri.parse(
    `inmemory://spektrum/${path.split("/").map(encodeURIComponent).join("/")}`,
  );
}

export const MonacoEditor = forwardRef<MonacoEditorHandle, MonacoEditorProps>(
  function MonacoEditor(
    {
      path,
      value,
      language,
      theme,
      preferences,
      readOnly = false,
      onChange,
      onCursorChange,
      onSelectionChange,
      onReady,
      onContextMenu,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const modelsRef = useRef(new Map<string, editor.ITextModel>());
    const viewStatesRef = useRef(new Map<string, editor.ICodeEditorViewState | null>());
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onCursorChangeRef = useRef(onCursorChange);
    onCursorChangeRef.current = onCursorChange;
    const onSelectionChangeRef = useRef(onSelectionChange);
    onSelectionChangeRef.current = onSelectionChange;
  // Suppress the change event for programmatic value replacement (loading a
  // document, conflict recovery) — those must not schedule a save of content
  // the server already has.
  const applyingExternal = useRef(false);

    // Create the editor once; themes are registered by the environment setup.
    useEffect(() => {
      setupMonacoEnvironment();
      // Grammars, configuration and folding must be registered before the
      // first model is created.
      registerLanguages(monaco);
      const el = hostRef.current;
      if (!el) return;

      const editor = monaco.editor.create(
        el,
        createEditorOptions(preferences, theme === "crixet"),
      );
      editorRef.current = editor;
      // Suppress Monaco's own context menu; the app renders a custom one.
      editor.updateOptions({ contextmenu: false });
      const onContextMenuEvent = (e: MouseEvent) => {
        e.preventDefault();
        onContextMenu?.({ x: e.clientX, y: e.clientY });
      };
      el.addEventListener("contextmenu", onContextMenuEvent);
      // Debug/test seam (non-production only): the page's own editor
      // instance. The e2e folding/autosave checks use it.
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __spektrum_editor?: unknown }).__spektrum_editor =
          editor;
      }

      const model = monaco.editor.createModel(
        value,
        languageForPath(path),
        modelUri(path),
      );
      modelsRef.current.set(path, model);
      editor.setModel(model);
      editor.onDidChangeModelContent(() => {
        if (applyingExternal.current) return;
        const current = editor.getModel();
        if (current) onChangeRef.current(current.getValue());
      });
      editor.onDidChangeCursorPosition((event) => {
        onCursorChangeRef.current?.(event.position.lineNumber);
      });
      editor.onDidChangeCursorSelection((event) => {
        const selection = event.selection;
        if (selection.isEmpty()) {
          onSelectionChangeRef.current?.(null);
          return;
        }
        const start = selection.getStartPosition();
        const end = selection.getEndPosition();
        onSelectionChangeRef.current?.({
          startLine: start.lineNumber,
          endLine: end.lineNumber,
        });
      });
      onReady?.();

      return () => {
        el.removeEventListener("contextmenu", onContextMenuEvent);
        editor.dispose();
        for (const m of modelsRef.current.values()) m.dispose();
        modelsRef.current.clear();
        viewStatesRef.current.clear();
        editorRef.current = null;
      };
      // The editor is created once per mount; `preferences`/`theme` changes
      // are applied by the effects below.
    }, []);

    // Swap models when the path changes.
    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const current = editor.getModel();
      if (current && current.uri.toString() === modelUri(path).toString()) return;
      if (current) {
        viewStatesRef.current.set(path, editor.saveViewState());
      }
      let model = modelsRef.current.get(path);
      if (!model) {
        model = monaco.editor.createModel(
          "",
          language || languageForPath(path),
          modelUri(path),
        );
        modelsRef.current.set(path, model);
      }
      editor.setModel(model);
      const saved = viewStatesRef.current.get(path);
      if (saved) editor.restoreViewState(saved);
      editor.focus();
    }, [path]);

    // The editor is read-only until the document's content has been loaded, so
    // a keystroke during page load cannot replace a real document with what
    // was typed.
    useEffect(() => {
      editorRef.current?.updateOptions({ readOnly });
    }, [readOnly]);

    // Apply preference changes without re-creating the editor.
    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.updateOptions({
        wordWrap: preferences.disableWordWrap ? "off" : "on",
        fontSize: preferences.editorFontSize,
        stickyScroll: { enabled: !preferences.disableStickyScroll },
      });
    }, [preferences]);

    // Apply the theme without re-creating the editor.
    useEffect(() => {
      monaco.editor.setTheme(theme);
    }, [theme]);

    // Vim (D42): monaco-vim 0.4.4's ESM and UMD builds both import
    // `monaco-editor/esm/vs/editor/editor.api`, which does not resolve under
    // monaco-editor 0.57's exports map ("./*.js": "./esm/vs/*.js"). The spike
    // therefore failed: the toggle is stored but inert in Phase 2, and
    // monaco-vim is not imported. Appendix D records the limitation.

    useImperativeHandle(
      ref,
      (): MonacoEditorHandle => ({
        getValue: () => editorRef.current?.getValue() ?? "",
        setValue: (v) => {
          const editor = editorRef.current;
          const model = editor?.getModel();
          if (editor && model) {
            editor.pushUndoStop();
            model.pushEditOperations(
              [],
              [{ range: model.getFullModelRange(), text: v }],
              () => null,
            );
            editor.pushUndoStop();
          }
        },
        loadValue: (v) => {
          const editor = editorRef.current;
          const model = editor?.getModel();
          if (editor && model) {
            applyingExternal.current = true;
            editor.pushUndoStop();
            model.pushEditOperations(
              [],
              [{ range: model.getFullModelRange(), text: v }],
              () => null,
            );
            editor.pushUndoStop();
            applyingExternal.current = false;
          }
        },
        applyHunks: (path, hunks) => {
          const editor = editorRef.current;
          const model = modelsRef.current.get(path);
          if (!editor || !model) return;
          const next = applyHunksToText(model.getValue(), hunks);
          applyingExternal.current = true;
          editor.pushUndoStop();
          model.pushEditOperations(
            [],
            [{ range: model.getFullModelRange(), text: next }],
            () => null,
          );
          editor.pushUndoStop();
          applyingExternal.current = false;
        },
        focus: () => editorRef.current?.focus(),
        getPosition: () => {
          const pos = editorRef.current?.getPosition();
          return pos ? { lineNumber: pos.lineNumber, column: pos.column } : null;
        },
        setPosition: (p) => {
          editorRef.current?.setPosition(p);
          editorRef.current?.revealPositionInCenter(p);
        },
        trigger: (action) => {
          editorRef.current?.trigger("spektrum", action, null);
        },
        revealLine: (line) => {
          const editor = editorRef.current;
          if (!editor) return;
          editor.revealLineInCenter(line);
          editor.setPosition({ lineNumber: line, column: 1 });
        },
        revealRange: (startLine, endLine) => {
          const editor = editorRef.current;
          if (!editor) return;
          editor.revealLineInCenter(startLine);
          editor.setSelection({
            startLineNumber: startLine,
            startColumn: 1,
            endLineNumber: endLine,
            endColumn: 1,
          });
        },
        getEditor: () => editorRef.current,
      }),
      [],
    );

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div
          ref={hostRef}
          data-testid="monaco-editor"
          className="min-h-0 flex-1 overflow-hidden"
        />
      </div>
    );
  },
);