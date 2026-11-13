"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import type { editor } from "monaco-editor";
import type { DocumentSummary } from "@/lib/documents";
import { EDITOR_CONTEXT_ITEMS, pasteFromClipboard, runEditorAction, wrapSelection } from "@/editor/commands";
import { QuickFileSearch } from "./quick-file-search";

export interface EditorContextMenuProps {
  x: number;
  y: number;
  editor: editor.IStandaloneCodeEditor | null;
  documents: DocumentSummary[];
  onClose(): void;
  onGoToPdf?(): void;
  onFileSearch?(): void;
  onOpenDocument(path: string): void;
}

export function EditorContextMenu({
  x,
  y,
  editor,
  documents,
  onClose,
  onGoToPdf,
  onFileSearch,
  onOpenDocument,
}: EditorContextMenuProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  const move = (delta: number) =>
    setActive((current) => {
      const next = current + delta;
      if (next < 0) return EDITOR_CONTEXT_ITEMS.length - 1;
      if (next >= EDITOR_CONTEXT_ITEMS.length) return 0;
      return next;
    });

  // Close on Escape or a click outside.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  // Clamp to the viewport so the card never renders off-screen.
  const left = Math.max(8, Math.min(x, window.innerWidth - 258));
  const top = Math.max(8, Math.min(y, window.innerHeight - 320));

  const run = (id: string) => {
    switch (id) {
      case "go-to-pdf":
        window.dispatchEvent(new CustomEvent("spektrum:go-to-pdf"));
        onGoToPdf?.();
        break;
      case "change-all":
        if (editor) runEditorAction(editor, "editor.action.changeAll");
        break;
      case "format":
        if (editor) runEditorAction(editor, "editor.action.formatDocument");
        break;
      case "bold":
        if (editor) wrapSelection(editor, "\\textbf{", "}");
        break;
      case "italic":
        if (editor) wrapSelection(editor, "\\textit{", "}");
        break;
      case "cut":
        if (editor) runEditorAction(editor, "editor.action.clipboardCutAction");
        break;
      case "copy":
        if (editor) runEditorAction(editor, "editor.action.clipboardCopyAction");
        break;
      case "paste":
        if (editor) void pasteFromClipboard(editor);
        break;
      case "command-palette":
        if (editor) runEditorAction(editor, "editor.action.quickCommand");
        break;
      case "file-search":
        onFileSearch?.();
        setSearchOpen(true);
        return;
    }
    onClose();
  };

  return (
    <>
      <div
        ref={ref}
        role="menu"
        aria-label="Editor context menu"
        tabIndex={-1}
        style={{ left, top }}
        className="fixed z-50 flex w-[250px] flex-col overflow-hidden rounded-2xl bg-modal-bg p-1 shadow-menu outline-none"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            run(EDITOR_CONTEXT_ITEMS[active]!.id);
          }
        }}
      >
        {EDITOR_CONTEXT_ITEMS.map((item, index) => {
          const newGroup = index > 0 && item.group !== EDITOR_CONTEXT_ITEMS[index - 1]!.group;
          return (
            <div key={item.id}>
              {newGroup ? <div className="my-1 h-px bg-[color:var(--border-log)]" /> : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => run(item.id)}
                onMouseEnter={() => setActive(index)}
                className={`flex h-8 w-full items-center justify-between gap-4 rounded-lg px-3 text-left text-xs ${
                  active === index
                    ? "bg-nav-bg-active text-text-editor-primary"
                    : "text-text-editor-secondary hover:bg-nav-bg-hover hover:text-text-editor-primary"
                }`}
              >
                <span className="truncate">{item.label}</span>
                {item.shortcut ? (
                  <span className="flex-none text-[color:var(--fg-tertiary)]">{item.shortcut}</span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>

      <QuickFileSearch
        documents={documents}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(path) => {
          setSearchOpen(false);
          onOpenDocument(path);
        }}
      />
    </>
  );
}