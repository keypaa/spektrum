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
  getDocumentRequest,
  renameDocumentRequest,
} from "@/lib/document-client";
import type { SaveResult } from "@/lib/save-document";
import { usePreferences } from "@/components/preferences-provider";
import { ProjectSidebar } from "./sidebar/project-sidebar";
import { SIDEBAR_STORAGE_KEY, useResizablePane } from "./sidebar/resizable";
import { EditorContextMenu } from "./editor/editor-context-menu";
import { NewFileDialog } from "./dialogs/new-file-dialog";
import { RenameFileDialog } from "./dialogs/rename-file-dialog";
import { DeleteFileDialog } from "./dialogs/delete-file-dialog";
import { PdfPane } from "./pdf-pane";
import { Composer } from "./composer/composer";
import { readTabs, tabsReducer, writeTabs, type TabsState } from "./tabs/tabs";
import { TabStrip } from "./tabs/tab-strip";
import { useAutosave } from "./use-autosave";
import { requestCompile } from "@/lib/compile-client";
import { useRenderStream } from "@/lib/render-client";
import type { MonacoEditorHandle } from "@/editor/monaco-editor";
import type { PdfViewerHandle } from "@/components/pdf/pdf-viewer";
import { PdfChrome, pillState } from "@/components/pdf/pdf-chrome";
import { PdfSearch } from "@/components/pdf/pdf-search";
import { fetchSyncTex } from "@/lib/synctex-client";
import { nearestForward } from "@/components/pdf/use-sync-scroll";
import { nearestAnchor } from "@/components/pdf/use-sync-jump";
import type { SyncTexMap } from "@spektrum/shared";
import { IconTools } from "@spektrum/ui/icons";

// Monaco is browser-only; the dynamic import (ssr: false) must come from this
// client component, not the RSC page.
const MonacoEditor = dynamic(
  () => import("@/editor/monaco-editor").then((m) => m.MonacoEditor),
  { ssr: false },
);

// The PDF viewer is browser-only (pdfjs canvas); the placeholder shows until
// the first render exists.
const PdfViewer = dynamic(
  () => import("@/components/pdf/pdf-viewer").then((m) => m.PdfViewer),
  { ssr: false },
);

export interface EditorClientProps {
  project: { id: string; name: string };
  documents: DocumentSummary[];
  initialDocument: DocumentRecord | null;
  /** The project's main file path (for the compile request). */
  mainFilePath?: string;
  /** The latest render at page load (for the status pill and isCurrent). */
  initialRender?: {
    isCurrent: boolean;
    status: string;
    revision: string;
    pdfUrl: string | null;
    mainFile: string | null;
    durationMs: number;
  } | null;
  user: { name: string; email: string };
}

function byPath(a: DocumentSummary, b: DocumentSummary): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export function EditorClient({
  project,
  documents,
  initialDocument,
  mainFilePath = "",
  initialRender = null,
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
  // Resolve "system" against the theme the pre-paint script actually applied
  // (the html class), and follow live theme changes.
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setIsDark(el.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  const [activeSection, setActiveSection] = useState<"files" | "chats">("files");
  const [docs, setDocs] = useState<DocumentSummary[]>(documents);
  const [buffer, setBuffer] = useState(initialDocument?.content ?? "");
  const [baseline, setBaseline] = useState(initialDocument?.updatedAt ?? "");
  const [loadedId, setLoadedId] = useState(initialDocument?.id ?? null);
  // The path whose content was last applied to the editor model (Task 14 owns
  // tab state; this is the buffer cache's key).
  const [loadedPath, setLoadedPath] = useState<string | null>(
    initialDocument?.path ?? null,
  );
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

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

  // Load the content of the active document. The RSC only ships the initial
  // document; switching tabs fetches the rest (spec §11.0: the DB is the
  // source of truth, the browser buffer is a cache). `loadedPath` tracks which
  // document the editor model currently holds — the RSC initial doc is a
  // starting value only; a later switch overwrites the buffer, so the guard
  // must compare paths, not the RSC record.
  useEffect(() => {
    if (!activePath || activePath === loadedPath) return;
    let cancelled = false;
    // Snapshot the model's value when the fetch starts: if the user types
    // before it resolves, the fetched (older) content must not clobber the
    // newer local buffer.
    const valueAtStart = editorRef.current?.getValue() ?? "";
    getDocumentRequest(project.id, activePath)
      .then((doc) => {
        if (cancelled) return;
        const editedSince = (editorRef.current?.getValue() ?? "") !== valueAtStart;
        if (!editedSince) {
          setBuffer(doc.content ?? "");
          setBaseline(doc.updatedAt);
          setLoadedId(doc.id);
          setLoadedPath(activePath);
          // The Monaco model swap already created the (empty) model for this
          // path synchronously; the fetch resolves after it, so setValue hits
          // the right model. `applyExternal` suppresses the onChange round-trip.
          applyExternal(doc.content ?? "");
        } else {
          // The user typed while the fetch was in flight; the baseline still
          // advances so the next save targets the right revision.
          setBaseline(doc.updatedAt);
          setLoadedId(doc.id);
          setLoadedPath(activePath);
        }
      })
      .catch(() => {
        // A missing document leaves the empty buffer; the next edit surfaces
        // the error through the save path.
      });
    return () => {
      cancelled = true;
    };
  }, [activePath, loadedPath, project.id]);

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
      setDirty(false);
      if (preferences.realtimeCompilation) void compile();
    },
    onConflict: (current) => {
      // §11.0: last write wins per document, but the losing tab reloads the
      // document (and keeps the cursor).
      const position = editorRef.current?.getPosition();
      setBuffer(current.content ?? "");
      setBaseline(current.updatedAt);
      setDirty(false);
      if (editorRef.current) {
        editorRef.current.setValue(current.content ?? "");
        if (position) editorRef.current.setPosition(position);
      }
    },
    onError: () => flashSaveNote("error"),
  });

  const render = useRenderStream(project.id);
  const pdfPageRef = useRef<PdfViewerHandle | null>(null);
  const pdfUrl =
    render.status?.event === "result"
      ? render.status.pdfUrl
      : (initialRender?.pdfUrl ?? null);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(initialRender?.revision ?? "");
  const [syncMap, setSyncMap] = useState<SyncTexMap | null>(null);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const status = render.status;
    if (status && "revision" in status) setRevision(status.revision);
  }, [render.status]);

  useEffect(() => {
    if (!revision) return;
    let cancelled = false;
    void fetchSyncTex(project.id, revision).then((map) => {
      if (!cancelled) setSyncMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [project.id, revision]);

  const onCursor = useCallback(
    (line: number) => {
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(() => {
        if (!syncMap || !activePath) return;
        const entry = nearestForward(syncMap.forward[activePath], line);
        if (entry) pdfPageRef.current?.scrollTo(entry.page, entry.x, entry.y);
      }, 120);
    },
    [syncMap, activePath],
  );



  // Cmd/Ctrl+F opens the PDF search pill (only when a PDF is showing).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const compile = useCallback(async () => {
    if (!mainFilePath) return;
    await requestCompile(project.id, mainFilePath).catch(() => undefined);
  }, [project.id, mainFilePath]);

  // Project open: compile when the persisted render is not the current revision.
  const mountCompiled = useRef(false);
  useEffect(() => {
    if (mountCompiled.current) return;
    if (initialRender && initialRender.isCurrent) return;
    mountCompiled.current = true;
    void compile();
  }, [compile, initialRender]);

  // A conflict event is for the tab that did not save: reload that document
  // and keep the cursor (spec §11.0). A dirty buffer is never clobbered.
  useEffect(() => {
    const status = render.status;
    if (!status || status.event !== "conflict") return;
    if (status.documentId !== activeDoc?.id) return;
    const current = editorRef.current?.getValue() ?? bufferRef.current;
    if (current !== bufferRef.current) return;
    void getDocumentRequest(project.id, activePath ?? "")
      .then((doc) => {
        setBuffer(doc.content ?? "");
        setBaseline(doc.updatedAt);
        editorRef.current?.loadValue(doc.content ?? "");
      })
      .catch(() => undefined);
  }, [render.status, activeDoc?.id, activePath, project.id]);

  // Cmd/Ctrl+S forces a save.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void autosave.flush().then(() => compile());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [autosave]);

  const onBufferChange = useCallback(
    (value: string) => {
      setBuffer(value);
      setDirty(true);
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

  // Replace the editor's content without re-triggering autosave (used when a
  // document is loaded or a conflict is resolved).
  const applyExternal = useCallback((content: string) => {
    editorRef.current?.loadValue(content);
  }, []);

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
  const onPdfDoubleClick = useCallback(
    (page: number, _x: number, y: number) => {
      const anchors =
        syncMap?.backward.find((entry) => entry.page === page)?.anchors ?? [];
      const anchor = nearestAnchor(anchors, y);
      if (!anchor) return;
      void openDocument(anchor.path).then(() => {
        editorRef.current?.revealLine(anchor.line);
      });
    },
    [syncMap, openDocument],
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
            onRecompile={() => void compile()}
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
              theme={isDark ? "crixet" : "crixet-light"}
              preferences={preferences}
              onChange={onBufferChange}
              onCursorChange={onCursor}
              onContextMenu={(point) => setContextMenu(point)}
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

      {pdfUrl ? (
        <div data-testid="pdf-pane" className="flex h-full min-h-0 flex-col bg-bg-code p-2">
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-lg bg-bg-preview">
            <div className="relative z-10">
              <PdfChrome
                state={pillState({
                  render: render.status,
                  isCurrent: initialRender?.isCurrent ?? false,
                  dirty,
                })}
                page={page}
                numPages={numPages}
                zoom={zoom}
                onPage={setPage}
                onZoom={setZoom}
                onRefresh={() => void compile()}
                onGoToPdf={() => {
                  document
                    .querySelector('[data-testid="pdf-viewport"]')
                    ?.scrollIntoView({ block: "start" });
                }}
                onSearch={() => setSearchOpen(true)}
                pdfUrl={pdfUrl}
                mainFile={initialRender?.mainFile ?? null}
                durationMs={initialRender?.durationMs ?? null}
                isCurrent={initialRender?.isCurrent ?? false}
                revision={initialRender?.revision ?? null}
                darkMode={preferences.pdfDarkMode}
                zoomShortcuts={preferences.pdfZoomShortcuts}
              />
            </div>
            <div className="min-h-0 flex-1">
              <PdfViewer
                pdfUrl={pdfUrl}
                revision={initialRender?.revision ?? ""}
                zoom={zoom / 100}
                darkMode={preferences.pdfDarkMode}
                onNumPages={setNumPages}
                onPageChange={setPage}
                onPageDoubleClick={onPdfDoubleClick}
                pageRef={pdfPageRef}
              />
            </div>
            {searchOpen ? (
              <PdfSearch
                query=""
                onQuery={() => undefined}
                onClose={() => setSearchOpen(false)}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <PdfPane />
      )}

      {contextMenu ? (
        <EditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          editor={editorRef.current?.getEditor() ?? null}
          documents={docs}
          onClose={() => setContextMenu(null)}
          onOpenDocument={(path) => {
            setContextMenu(null);
            void openDocument(path);
          }}
        />
      ) : null}

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