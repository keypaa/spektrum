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
import { saveDocumentRequest, type SaveResult } from "@/lib/save-document";
import { usePreferences } from "@/components/preferences-provider";
import { ProjectSidebar } from "./sidebar/project-sidebar";
import type { ChatThreadSummary } from "./sidebar/chat-list";
import { SIDEBAR_STORAGE_KEY, useResizablePane } from "./sidebar/resizable";
import { EditorContextMenu } from "./editor/editor-context-menu";
import { NewFileDialog } from "./dialogs/new-file-dialog";
import { RenameFileDialog } from "./dialogs/rename-file-dialog";
import { DeleteFileDialog } from "./dialogs/delete-file-dialog";
import { PdfPane } from "./pdf-pane";
import { Composer } from "./composer/composer";
import { useChat } from "./composer/use-chat";
import { acceptDiff, type DiffPart } from "./composer/diff-accept";
import { DiffWidget } from "./composer/diff-widget";
import { FIX_PROMPT, REVIEW_PROMPT } from "@spektrum/shared/ai";
import { sha256Hex } from "@spektrum/shared/hash";
import { readTabs, tabsReducer, writeTabs, type TabsState } from "./tabs/tabs";
import { TabStrip } from "./tabs/tab-strip";
import { useAutosave } from "./use-autosave";
import { requestCompile } from "@/lib/compile-client";
import { useRenderStream } from "@/lib/render-client";
import type { MonacoEditorHandle } from "@/editor/monaco-editor";
import type { PdfViewerHandle } from "@/components/pdf/pdf-viewer";
import { PdfChrome, pillState } from "@/components/pdf/pdf-chrome";
import { CompileErrorBanner } from "./compile-error-banner";
import { PdfSearch } from "@/components/pdf/pdf-search";
import { InfoPanel, INFO_TABS, type InfoTab } from "@/components/info-panel/info-panel";
import { Logs } from "@/components/info-panel/logs";
import { ProjectInfo } from "@/components/info-panel/project-info";
import { Versions } from "@/components/info-panel/versions";
import { Comments } from "@/components/info-panel/comments";
import { ShareDialog } from "@/components/info-panel/share-dialog";
import type { SnapshotRow } from "@spektrum/db/snapshots";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spektrum/ui";
import { fetchSyncTex } from "@/lib/synctex-client";
import { nearestForward } from "@/components/pdf/use-sync-scroll";
import { nearestAnchor } from "@/components/pdf/use-sync-jump";
import type { Diagnostic, ProjectStats, SyncTexMap } from "@spektrum/shared";
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
    lastOkRevision: string | null;
    mainFile: string | null;
    durationMs: number;
    diagnostics: Diagnostic[];
    stats: ProjectStats | null;
  } | null;
  user: { name: string; email: string };
  aiEnabled: boolean;
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
  aiEnabled,
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
  // The preview pane measures from the right edge, minus the grid's pr-4.
  const { onPointerDown: onPreviewPointerDown, dragging: previewDragging } =
    useResizablePane({
      storageKey: "spektrum_editor_preview_pane_v1",
      cssVar: "--right-pane-width",
      initial: 677,
      min: 360,
      max: 1400,
      rootRef,
      fromRight: true,
      edgeOffset: 16,
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
  const loadedPathRef = useRef(loadedPath);
  loadedPathRef.current = loadedPath;
  const docsRef = useRef(docs);
  docsRef.current = docs;
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
  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;

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
  // Keep the last successful URL: a `status: running|error` frame must not
  // unmount the pane (spec §11.2 partial renders).
  const [pdfUrl, setPdfUrl] = useState<string | null>(
    initialRender?.pdfUrl ?? null,
  );
  useEffect(() => {
    if (render.status?.event === "result") setPdfUrl(render.status.pdfUrl);
  }, [render.status]);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [panel, setPanel] = useState<InfoTab | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const refreshThreads = useCallback(async () => {
    const response = await fetch(`/api/projects/${project.id}/threads`);
    if (!response.ok) return;
    const body = (await response.json()) as { threads?: ChatThreadSummary[] };
    setThreads(Array.isArray(body.threads) ? body.threads : []);
  }, [project.id]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  const chat = useChat({
    projectId: project.id,
    onDiff: (part) => {
      setPanel(null);
      setReviewingId(part.id);
    },
    onTitle: () => void refreshThreads(),
    onThreadChange: (id) => {
      setActiveThreadId(id);
      if (id) router.replace(`/u/${project.id}?thread=${id}`, { scroll: false });
      void refreshThreads();
    },
  });
  const openTabs = docs.map((doc) => doc.path);

  const selectThread = (thread: ChatThreadSummary) => {
    void chat.loadThread(thread.id);
  };

  const newChat = () => {
    chat.reset();
    router.replace(`/u/${project.id}`, { scroll: false });
  };

  const renameThread = async (thread: ChatThreadSummary, title: string) => {
    const response = await fetch(
      `/api/projects/${project.id}/threads/${thread.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    if (response.ok) await refreshThreads();
  };

  const deleteThread = async (thread: ChatThreadSummary) => {
    const response = await fetch(
      `/api/projects/${project.id}/threads/${thread.id}`,
      { method: "DELETE" },
    );
    if (!response.ok) return;
    if (activeThreadId === thread.id) {
      chat.reset();
      router.replace(`/u/${project.id}`, { scroll: false });
    }
    await refreshThreads();
  };

  const regenerateThread = async (thread: ChatThreadSummary) => {
    const response = await fetch(
      `/api/projects/${project.id}/threads/${thread.id}/title/regenerate`,
      { method: "POST" },
    );
    if (response.ok) await refreshThreads();
  };
  const [shareOpen, setShareOpen] = useState(false);
  const [pdfQuery, setPdfQuery] = useState("");
  const [log, setLog] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(initialRender?.revision ?? "");
  const [lastOk, setLastOk] = useState(
    initialRender?.lastOkRevision ?? "",
  );
  const [syncMap, setSyncMap] = useState<SyncTexMap | null>(null);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const status = render.status;
    if (status && "revision" in status) setRevision(status.revision);
  }, [render.status]);

  useEffect(() => {
    const mapRevision = lastOk || revision;
    if (!mapRevision) return;
    let cancelled = false;
    void fetchSyncTex(project.id, mapRevision).then((map) => {
      if (!cancelled) setSyncMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [project.id, revision, lastOk]);

  // SyncTeX forward search: put the preview on the place the cursor is in.
  const revealPdfLine = useCallback(
    (line: number) => {
      if (!syncMap || !activePath) return;
      const entry = nearestForward(syncMap.forward[activePath], line);
      if (!entry) return;
      pdfPageRef.current?.scrollTo(entry.page, entry.x, entry.y);
      const geometry = pdfPageRef.current?.getPageGeometry(entry.page);
      if (geometry) {
        pdfPageRef.current?.revealLineRect(entry.page, {
          x: entry.x * geometry.width,
          y: entry.y * geometry.height,
          width: geometry.width * 0.6,
          height: 14,
        });
      }
    },
    [syncMap, activePath],
  );

  // The editor follows along as you move the cursor…
  const cursorLine = useRef(1);
  const onCursor = useCallback(
    (line: number) => {
      cursorLine.current = line;
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(() => revealPdfLine(line), 120);
    },
    [revealPdfLine],
  );



  const [latestDiagnostics, setLatestDiagnostics] = useState<Diagnostic[]>(
    initialRender?.diagnostics ?? [],
  );
  useEffect(() => {
    if (render.status?.event !== "status" || render.status.state !== "error")
      return;
    void fetch(`/api/projects/${project.id}/render/latest`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((body: { render?: { diagnostics?: Diagnostic[] } | null }) => {
        setLatestDiagnostics(body.render?.diagnostics ?? []);
      })
      .catch(() => undefined);
  }, [render.status, project.id]);
  const diagnostics =
    render.status?.event === "result"
      ? render.status.diagnostics
      : latestDiagnostics;

  // A failed compile must be visible where you are looking. The pill alone
  // changes "Compiled" → "Failed" while the previous PDF stays on screen, and
  // the log text lives behind Tools → Logs, so the failure read as a stale PDF.
  const failed =
    render.status?.event === "status"
      ? render.status.state === "error"
      : render.status?.event === "result"
        ? false
        : initialRender?.status === "error";
  const errorDiagnostic = failed
    ? (diagnostics.find((d) => d.severity === "error") ?? diagnostics[0] ?? null)
    : null;
  useEffect(() => {
    if (render.status?.event === "result")
      setLastOk(render.status.revision);
  }, [render.status]);
  const stats =
    render.status?.event === "result"
      ? render.status.stats
      : (initialRender?.stats ?? null);
  const [snapshotRows, setSnapshotRows] = useState<SnapshotRow[]>([]);

  useEffect(() => {
    if (panel !== "Versions") return;
    let cancelled = false;
    void fetch(`/api/projects/${project.id}/snapshots`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { snapshots?: SnapshotRow[] };
        if (!cancelled) setSnapshotRows(body.snapshots ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [panel, project.id]);

  const restoreBatch = useCallback(
    (batchId: string) => {
      const row = snapshotRows.find((entry) => entry.batchId === batchId);
      if (!row) return;
      void fetch(
        `/api/projects/${project.id}/snapshots/${row.id}/restore`,
        { method: "POST" },
      )
        .then((res) => {
          if (res.ok) window.location.reload();
        })
        .catch(() => undefined);
    },
    [project.id, router, snapshotRows],
  );

  useEffect(() => {
    if (panel !== "Logs" || !revision) return;
    let cancelled = false;
    void fetch(`/api/projects/${project.id}/render/${revision}/log`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { log?: string };
        if (!cancelled) setLog(body.log ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [panel, project.id, revision]);

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
    if (dirty) return;
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

  // --- Diff review (spec §7.4): one inline Monaco diff at a time. ---------
  const [diffStale, setDiffStale] = useState(false);
  const loadedWaiters = useRef(new Map<string, () => void>());

  useEffect(() => {
    if (!loadedPath) return;
    const resolve = loadedWaiters.current.get(loadedPath);
    if (resolve) {
      loadedWaiters.current.delete(loadedPath);
      resolve();
    }
  }, [loadedPath]);

  const whenPathLoaded = useCallback((path: string) => {
    // Read the live value: a stale closure would wait for a transition that
    // already happened and hang the accept.
    if (loadedPathRef.current === path) return Promise.resolve();
    return new Promise<void>((resolve) => {
      loadedWaiters.current.set(path, resolve);
    });
  }, []);

  const reviewingPart =
    chat.parts.find(
      (part): part is DiffPart =>
        part.type === "diff" && part.id === reviewingId && part.status === "pending",
    ) ??
    [...chat.parts]
      .reverse()
      .find(
        (part): part is DiffPart =>
          part.type === "diff" && part.status === "pending",
      ) ??
    null;

  useEffect(() => {
    if (!reviewingPart || reviewingPart.proposal.path !== activePath) {
      setDiffStale(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const current = editorRef.current?.getValue() ?? bufferRef.current;
      void sha256Hex(current).then((hash) => {
        if (!cancelled) {
          setDiffStale(hash !== reviewingPart.proposal.originalHash);
        }
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reviewingPart, activePath, buffer]);

  const acceptPart = async (
    part: DiffPart,
  ): Promise<{ ok: true } | { ok: false; error: string }> =>
    acceptDiff(part, {
      projectId: project.id,
      activePath: activePathRef.current,
      findDoc: (path) => docsRef.current.find((doc) => doc.path === path),
      currentContent: (path) =>
        path === activePathRef.current
          ? editorRef.current?.getValue() ?? bufferRef.current
          : "",
      baselineFor: () => baselineRef.current,
      openPath: openDocument,
      whenLoaded: whenPathLoaded,
      applyHunks: (path, hunks) => editorRef.current?.applyHunks(path, hunks),
      save: (documentId, content, baseUpdatedAt) =>
        saveDocumentRequest(project.id, documentId, content, baseUpdatedAt),
      create: async (path) => {
        const doc = await createDocumentRequest(project.id, path);
        setDocs((prev) =>
          [
            ...prev.filter((d) => d.path !== doc.path),
            { id: doc.id, path: doc.path, kind: doc.kind, updatedAt: doc.updatedAt },
          ].sort(byPath),
        );
        // Leave the buffer alone: the new file is opened explicitly (the row
        // click), which loads it from the server with the saved content.
        return { id: doc.id, updatedAt: doc.updatedAt };
      },
      remove: async (path) => {
        const doc = docsRef.current.find((d) => d.path === path);
        if (!doc) return;
        await deleteDocumentRequest(project.id, doc.id);
        setDocs((prev) => prev.filter((d) => d.id !== doc.id));
        dispatch({ type: "close", path });
        afterMutation();
      },
      onSaved: (path, content, updatedAt) => {
        // Only the active document's buffer/baseline is authoritative here; a
        // create for a non-active path leaves the editor untouched (the user
        // opens the new file, which loads it from the server).
        if (path !== activePathRef.current) return;
        setBuffer(content);
        setBaseline(updatedAt);
        setDirty(false);
        setLoadedPath(path);
        setSaveNote(null);
        const editor = editorRef.current;
        if (editor && editor.getValue() !== content) editor.loadValue(content);
        if (preferences.realtimeCompilation) void compile();
      },
    });

  const patchDecision = async (
    part: DiffPart,
    decision: "accepted" | "rejected",
  ): Promise<void> => {
    if (!chat.threadId) return;
    await fetch(
      `/api/projects/${project.id}/threads/${chat.threadId}/messages/${part.messageId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ diffId: part.id, decision }),
      },
    );
    chat.setDiffStatus(part.id, decision);
  };

  const acceptAll = async (): Promise<void> => {
    const pending = chat.parts.filter(
      (part): part is DiffPart =>
        part.type === "diff" && part.status === "pending",
    );
    for (const part of pending) {
      const result = await acceptPart(part);
      if (result.ok) await patchDecision(part, "accepted");
    }
    setReviewingId(null);
  };
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
          threads={threads}
          activeThreadId={activeThreadId}
          aiEnabled={aiEnabled}
          chatBusy={chat.status === "streaming"}
          onNewChat={newChat}
          onSelectThread={selectThread}
          onRenameThread={renameThread}
          onDeleteThread={deleteThread}
          onRegenerateThread={regenerateThread}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Tools"
                    className="flex h-9 flex-none items-center gap-2 rounded-full bg-[color:var(--button-primary-bg)] px-3 text-xs font-medium text-[color:var(--button-primary-text)]"
                  >
                    <IconTools size={14} />
                    Tools
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {INFO_TABS.map((tab) => (
                    <DropdownMenuItem key={tab} onSelect={() => setPanel(tab)}>
                      {tab}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onSelect={() => setShareOpen(true)}>
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>Export</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
          className="relative min-h-0 flex-1 overflow-hidden bg-bg-code"
        >
          {activePath ? (
            <MonacoEditor
              ref={editorRef}
              path={activePath}
              value={buffer}
              language={activePath.endsWith(".bib") ? "bibtex" : "latex"}
              theme={isDark ? "crixet" : "crixet-light"}
              preferences={preferences}
              // Nothing is editable until this document's content has been
              // loaded; typing into the empty placeholder would replace the
              // real file with what was typed.
              readOnly={activePath !== loadedPath}
              onChange={onBufferChange}
              onCursorChange={onCursor}
              onContextMenu={(point) => setContextMenu(point)}
            />
          ) : null}
          {reviewingPart ? (
            <DiffWidget
              part={reviewingPart}
              original={
                reviewingPart.proposal.path === activePath
                  ? editorRef.current?.getValue() ?? buffer
                  : ""
              }
              projectId={project.id}
              threadId={chat.threadId}
              theme={isDark ? "crixet" : "crixet-light"}
              stale={diffStale}
              busy={chat.status === "streaming"}
              onAccept={acceptPart}
              onReject={async () => {}}
              onRerun={(part) => {
                chat.rerun(part);
                setReviewingId(null);
              }}
              onStatus={(part, status) => {
                chat.setDiffStatus(part.id, status);
                if (status === "accepted") setReviewingId(null);
              }}
              onAcceptAll={() => void acceptAll()}
            />
          ) : null}
        </div>
        <div
          data-testid="composer-slot-placeholder"
          className="flex-none border-t border-[color:var(--border-log)]"
          style={{ height: chat.parts.length > 0 ? "min(45vh, 420px)" : "180px" }}
        >
          <Composer
            chat={chat}
            aiEnabled={aiEnabled}
            onReview={() => chat.send(REVIEW_PROMPT, "Medium", openTabs)}
            openTabs={openTabs}
            onReviewDiff={(part) => setReviewingId(part.id)}
          />
        </div>
      </div>

      {/* Right column (PDF / info panel). Wrapped so the divider between it and
          the editor can be dragged; the hook writes --right-pane-width. */}
      <div className="relative min-h-0 min-w-0">
      {panel ? (
        <div data-testid="pdf-pane" className="h-full min-h-0 bg-bg-code p-2">
          <div className="h-full overflow-hidden rounded-t-lg bg-bg-sidepanel">
            <InfoPanel tab={panel} onTab={setPanel} onClose={() => setPanel(null)}>
              {panel === "Logs" ? (
                <Logs
                  diagnostics={diagnostics}
                  log={log}
                  onJump={(diagnostic) => {
                    setPanel(null);
                    const line = (diagnostic.line ?? 0) + 1;
                    if (diagnostic.file) {
                      void openDocument(diagnostic.file).then(() => {
                        // The model swap commits in the path-change effect after
                        // the render; wait one frame before moving the cursor.
                        setTimeout(
                          () => editorRef.current?.revealLine(line),
                          50,
                        );
                      });
                    } else {
                      setTimeout(
                        () => editorRef.current?.revealLine(line),
                        50,
                      );
                    }
                  }}
                  onFix={(targets) => {
                    setPanel(null);
                    void chat.send(FIX_PROMPT(targets), "Medium", openTabs);
                  }}
                  aiEnabled={aiEnabled}
                />
              ) : panel === "Project Info" ? (
                <ProjectInfo stats={stats} />
              ) : panel === "Versions" ? (
                <Versions rows={snapshotRows} onRestore={restoreBatch} />
              ) : panel === "Comments" ? (
                <Comments />
              ) : (
                <div className="p-4 text-sm text-fg-tertiary" />
              )}
            </InfoPanel>
          </div>
        </div>
      ) : pdfUrl ? (
        <div data-testid="pdf-pane" className="flex h-full min-h-0 flex-col bg-bg-code p-2">
          <CompileErrorBanner
            diagnostic={errorDiagnostic}
            onOpenLogs={() => setPanel("Logs")}
          />
          {/* The sheet stays light in both themes (tokens.css keeps --bg-preview
              near-white even in dark mode), while the app's foreground is light
              in dark mode — so the toolbar on it inherited white-on-white and
              its icons and labels disappeared. The preview ink token is dark in
              both themes; opting in here covers the chrome, the search pill's
              border and any other inherited text on the sheet. */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-lg bg-bg-preview text-[color:var(--text-preview-primary)]">
            {/* No `relative` here on purpose: PdfChrome's floating bar is
                absolutely positioned and must resolve against the sheet, not
                against this 52 px toolbar row — otherwise `bottom-3` pinned it
                on top of the toolbar. `z-10` still applies (this is a flex
                item), so the toolbar stays above the viewer. */}
            <div className="z-10">
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
                onGoToPdf={() => revealPdfLine(cursorLine.current)}
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
                searchQuery={pdfQuery}
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
                query={pdfQuery}
                onQuery={setPdfQuery}
                onClose={() => {
                  setSearchOpen(false);
                  setPdfQuery("");
                }}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <PdfPane />
      )}
        {/* 1 px separator; drag to resize the preview (360–1400). */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize preview pane"
          onPointerDown={onPreviewPointerDown}
          className={`absolute inset-y-0 left-0 w-px cursor-col-resize bg-[color:var(--border-log)] ${
            previewDragging ? "bg-[color:var(--border-brand)]" : ""
          }`}
        />
      </div>

      <ShareDialog
        open={shareOpen}
        projectName={project.name}
        onClose={() => setShareOpen(false)}
      />

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