"use client";

// The editor shell (spec §6.3; measured geometry in
// zenno/recon/extracted/editor-ui.md §1.1–1.6). Three columns:
// sidebar 442 / centre flex min 480 / right pane 677, with the capture's 16 px
// page-scrollbar strip reserved on the right. The centre column is an 84 px
// header block (64 px tab row + 2 px rule + 16 px icon strip + 2 px rule), the
// editor area and the 88 px composer slot.

import type { ReactElement } from "react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type {
  DocumentRecord,
  DocumentSummary,
} from "@/lib/documents";
import {
  createDocumentRequest,
  deleteDocumentRequest,
  renameDocumentRequest,
} from "@/lib/document-client";
import type { SaveResult } from "@/lib/save-document";
import { usePreferences } from "@/components/preferences-provider";
import { ProjectSidebar } from "./sidebar/project-sidebar";
import { SIDEBAR_STORAGE_KEY, useResizablePane } from "./sidebar/resizable";
import { NewFileDialog } from "./dialogs/new-file-dialog";
import { RenameFileDialog } from "./dialogs/rename-file-dialog";
import { DeleteFileDialog } from "./dialogs/delete-file-dialog";
import { PdfPane } from "./pdf-pane";
import { Composer } from "./composer/composer";
import { readTabs, tabsReducer, writeTabs, type TabsState } from "./tabs/tabs";
import { TabStrip } from "./tabs/tab-strip";
import { useAutosave } from "./use-autosave";
import type { MonacoEditorHandle } from "@/editor/monaco-editor";
import { IconTools } from "@spektrum/ui/icons";

// Monaco is browser-only; the dynamic import (ssr: false) must come from this
// client component, not the RSC page.
const MonacoEditor = dynamic(
  () => import("@/editor/monaco-editor").then((m) => m.MonacoEditor),
  { ssr: false },
);

export interface EditorClientProps {
  project: { id: string; name: string };
  documents: DocumentSummary[];
  initialDocument: DocumentRecord | null;
  user: { name: string; email: string };
}

function byPath(a: DocumentSummary, b: DocumentSummary): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export function EditorClient({
  project,
  documents,
  initialDocument,
  user,
}: EditorClientProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const { onPointerDown, dragging } = useResizablePane({
    storageKey: SIDEBAR_STORAGE_KEY,
    cssVar: "--sidebar-width",
    initial: 442,
    min: 240,
    max: 480,
    rootRef,
  });
  const { preferences } = usePreferences();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<"files" | "chats">("files");
  const [docs, setDocs] = useState<DocumentSummary[]>(documents);
  const [buffer, setBuffer] = useState(initialDocument?.content ?? "");
  const [baseline, setBaseline] = useState(initialDocument?.updatedAt ?? "");
  const [loadedId, setLoadedId] = useState(initialDocument?.id ?? null);
  const [saveNote, setSaveNote] = useState<"saving" | "error" | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<MonacoEditorHandle>(null);
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;
  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DocumentSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);

  const [tabs, dispatch] = useReducer(tabsReducer, null, (): TabsState => {
    // SSR-safe: the first render is identical on server and client (the RSC
    // props alone). The URL and localStorage boot runs in the effect below.
    const initialPath = initialDocument?.path;
    return initialPath
      ? { open: [initialPath], active: initialPath }
      : { open: [], active: null };
  });

  // Post-mount boot (client-only): stored tabs, `?p=`, then the document sync.
  // The whole stored list is restored — an RSC refresh can remount this
  // island, and only the active path would otherwise survive.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const known = documents.map((d) => d.path);
    const stored = readTabs(project.id);
    const synced = tabsReducer(stored, { type: "sync", paths: known });
    const wanted = new URL(window.location.href).searchParams.get("p");
    const toOpen = wanted && known.includes(wanted) ? wanted : synced.active;
    for (const path of synced.open) {
      if (path !== toOpen) dispatch({ type: "open", path });
    }
    if (toOpen) {
      dispatch({ type: "open", path: toOpen });
    } else if (initialDocument) {
      dispatch({ type: "open", path: initialDocument.path });
    }
  }, []);

  const activePath = tabs.active;
  const activeDoc = docs.find((d) => d.path === activePath) ?? null;

  // The RSC refresh (after a tab switch or a mutation) hands back the freshly
  // loaded document; adopt its content/baseline once it is the active path.
  useEffect(() => {
    if (!initialDocument) return;
    if (initialDocument.id !== loadedId) {
      setLoadedId(initialDocument.id);
      setBuffer(initialDocument.content ?? "");
      setBaseline(initialDocument.updatedAt);
    }
  }, [initialDocument, loadedId]);

  const flashSaveNote = useCallback((kind: "saving" | "error") => {
    setSaveNote(kind);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setSaveNote(null), 5000);
  }, []);

  const autosave = useAutosave({
    projectId: project.id,
    documentId: activeDoc?.id ?? "",
    // The editor is the source of truth for the live buffer; React state lags
    // a render behind it, and an unload-flush cannot afford that lag.
    getValue: () => editorRef.current?.getValue() ?? bufferRef.current,
    getBaseline: () => baselineRef.current,
    onSaved: (result: SaveResult) => {
      setBaseline(result.updatedAt);
      setSaveNote(null);
    },
    onConflict: (current) => {
      // §11.0: last write wins per document, but the losing tab reloads the
      // document (and keeps the cursor).
      const position = editorRef.current?.getPosition();
      setBuffer(current.content ?? "");
      setBaseline(current.updatedAt);
      if (editorRef.current) {
        editorRef.current.setValue(current.content ?? "");
        if (position) editorRef.current.setPosition(position);
      }
    },
    onError: () => flashSaveNote("error"),
  });

  // Cmd/Ctrl+S forces a save.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void autosave.flush();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [autosave]);

  const onBufferChange = useCallback(
    (value: string) => {
      setBuffer(value);
      autosave.schedule();
    },
    [autosave],
  );

  // Boot order (plan Task 14 Step 4): read storage → drop paths that are no
  // longer in the tree → ?p= wins → else the stored active → else the initial
  // document. The initialiser runs once; later changes flow through dispatch.

  // Persist on every state change and keep the URL in sync without a refetch.
  useEffect(() => {
    writeTabs(project.id, tabs);
    const url = new URL(window.location.href);
    if (tabs.active) {
      url.searchParams.set("p", tabs.active);
    } else {
      url.searchParams.delete("p");
    }
    window.history.replaceState(null, "", url);
  }, [tabs, project.id]);

  const paths = docs.map((d) => d.path);
  const tabDocs = tabs.open
    .map((path) => docs.find((d) => d.path === path))
    .filter((d): d is DocumentSummary => Boolean(d));

  const openDocument = useCallback(
    async (path: string) => {
      if (path === tabs.active) return;
      // The URL updates immediately (optimistic); the dispatch that swaps the
      // Monaco model waits for the flush so the pending buffer is never lost.
      const url = new URL(window.location.href);
      url.searchParams.set("p", path);
      window.history.replaceState(null, "", url);
      await autosave.flush();
      dispatch({ type: "open", path });
    },
    [autosave, tabs.active],
  );

  const afterMutation = () => {
    // The local state is already updated; refresh the RSC tree without a
    // visible flash.
    router.refresh();
  };

  const createFile = async (path: string) => {
    const doc = await createDocumentRequest(project.id, path);
    setDocs((prev) => [...prev.filter((d) => d.path !== doc.path), doc].sort(byPath));
    dispatch({ type: "open", path: doc.path });
    afterMutation();
  };

  const renameFile = async (path: string) => {
    if (!renameTarget) return;
    const from = renameTarget.path;
    const doc = await renameDocumentRequest(project.id, renameTarget.id, path);
    setDocs((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, path: doc.path, kind: doc.kind } : d)).sort(byPath),
    );
    dispatch({ type: "rename", from, to: doc.path });
    afterMutation();
  };

  const deleteFile = async () => {
    if (!deleteTarget) return;
    const removed = deleteTarget;
    await deleteDocumentRequest(project.id, removed.id);
    setDocs((prev) => prev.filter((d) => d.id !== removed.id));
    dispatch({ type: "close", path: removed.path });
    afterMutation();
  };

  const download = (doc: DocumentSummary) => {
    window.location.assign(
      `/api/projects/${project.id}/documents/${doc.id}/download`,
    );
  };

  return (
    <div
      ref={rootRef}
      data-testid="editor-root"
      style={
        {
          "--sidebar-width": "442px",
          "--right-pane-width": "677px",
        } as React.CSSProperties
      }
      className="grid h-screen grid-cols-[var(--sidebar-width)_minmax(480px,1fr)_var(--right-pane-width)] overflow-hidden pr-4"
    >
      <div className="relative min-h-0 min-w-0">
        <ProjectSidebar
          project={project}
          documents={docs}
          activePath={activePath}
          activeSection={activeSection}
          hiddenFiles={preferences.hiddenFiles}
          onSectionChange={setActiveSection}
          onOpenDocument={openDocument}
          onNewFile={() => setNewFileOpen(true)}
          onRenameDocument={setRenameTarget}
          onDeleteDocument={setDeleteTarget}
          onDownloadDocument={download}
          user={user}
        />
        {/* 1 px separator; drag to resize (240–480). */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={onPointerDown}
          className={`absolute inset-y-0 right-0 w-px cursor-col-resize bg-[color:var(--border-log)] ${
            dragging ? "bg-[color:var(--border-brand)]" : ""
          }`}
        />
      </div>

      {/* Centre column: header block (84 px), editor area, composer slot. */}
      <div className="flex min-h-0 min-w-0 flex-col bg-bg-code">
        <div className="flex-none">
          <TabStrip
            tabs={tabDocs}
            active={activePath}
            onActivate={openDocument}
            onClose={(path) => dispatch({ type: "close", path })}
            onCollapseSidebar={() => {}}
            onRecompile={() => {}}
            tools={
              <button
                type="button"
                aria-disabled="true"
                className="flex h-9 flex-none items-center gap-2 rounded-full bg-[color:var(--button-primary-bg)] px-3 text-xs font-medium text-[color:var(--button-primary-text)]"
              >
                <IconTools size={14} />
                Tools
              </button>
            }
            status={
              saveNote ? (
                <span
                  role="status"
                  aria-live="polite"
                  data-testid="save-note"
                  className={`flex-none text-xs ${
                    saveNote === "error" ? "text-fg-error" : "text-fg-tertiary"
                  }`}
                >
                  {saveNote === "error" ? "Save failed" : "Saving…"}
                </span>
              ) : null
            }
          />
          <div
            data-testid="editor-icon-strip"
            className="h-4 border-b-2 border-[color:var(--border-log)]"
          />
        </div>
        <div
          data-testid="editor-area-placeholder"
          className="min-h-0 flex-1 overflow-hidden bg-bg-code"
        >
          {activePath ? (
            <MonacoEditor
              ref={editorRef}
              path={activePath}
              value={buffer}
              language={activePath.endsWith(".bib") ? "bibtex" : "latex"}
              theme={preferences.interfaceTheme === "light" ? "crixet-light" : "crixet"}
              preferences={preferences}
              onChange={onBufferChange}
            />
          ) : null}
        </div>
        <div
          data-testid="composer-slot-placeholder"
          className="flex-none border-t border-[color:var(--border-log)]"
        >
          <Composer />
        </div>
      </div>

      <PdfPane />

      <NewFileDialog
        open={newFileOpen}
        existingPaths={paths}
        onSubmit={createFile}
        onOpenChange={setNewFileOpen}
      />
      <RenameFileDialog
        document={renameTarget}
        existingPaths={paths.filter((p) => p !== renameTarget?.path)}
        onSubmit={renameFile}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      />
      <DeleteFileDialog
        document={deleteTarget}
        onConfirm={deleteFile}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </div>
  );
}