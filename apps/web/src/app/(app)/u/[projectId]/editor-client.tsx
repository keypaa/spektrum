"use client";

// The editor shell (spec §6.3; measured geometry in
// zenno/recon/extracted/editor-ui.md §1.1–1.6). Three columns:
// sidebar 442 / centre flex min 480 / right pane 677, with the capture's 16 px
// page-scrollbar strip reserved on the right. The centre column is an 84 px
// header block (64 tab row + 2 rule + 16 icon strip + 2 rule), the editor area
// and the 88 px composer slot.
//
// Task 9 ships placeholders: Task 10 replaces the sidebar, Task 14 the tab
// strip, Task 16 the composer and Task 12 the editor area.

import type { ReactElement } from "react";
import { useRef, useState } from "react";
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
import { usePreferences } from "@/components/preferences-provider";
import { ProjectSidebar } from "./sidebar/project-sidebar";
import { SIDEBAR_STORAGE_KEY, useResizablePane } from "./sidebar/resizable";
import { NewFileDialog } from "./dialogs/new-file-dialog";
import { RenameFileDialog } from "./dialogs/rename-file-dialog";
import { DeleteFileDialog } from "./dialogs/delete-file-dialog";
import { PdfPane } from "./pdf-pane";

export interface EditorClientProps {
  project: { id: string; name: string };
  documents: DocumentSummary[];
  initialDocument: DocumentRecord | null;
  user: { name: string; email: string };
}

function Placeholder({
  testId,
  label,
  className = "",
}: {
  testId: string;
  label: string;
  className?: string;
}) {
  return (
    <div data-testid={testId} className={className}>
      <span className="text-xs text-fg-tertiary">{label}</span>
    </div>
  );
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
  const [initialPath, setInitialPath] = useState(initialDocument?.path ?? null);
  const [docs, setDocs] = useState<DocumentSummary[]>(documents);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DocumentSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);

  const paths = docs.map((d) => d.path);

  const openDocument = (path: string) => {
    // Task 14 owns tab state; until then the single buffer follows the click.
    setInitialPath(path);
    const url = new URL(window.location.href);
    url.searchParams.set("p", path);
    window.history.replaceState(null, "", url);
  };

  const afterMutation = () => {
    // The local state is already updated; refresh the RSC tree without a
    // visible flash.
    router.refresh();
  };

  const createFile = async (path: string) => {
    const doc = await createDocumentRequest(project.id, path);
    setDocs((prev) =>
      [...prev.filter((d) => d.path !== doc.path), doc].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      ),
    );
    openDocument(doc.path);
    afterMutation();
  };

  const renameFile = async (path: string) => {
    if (!renameTarget) return;
    const doc = await renameDocumentRequest(project.id, renameTarget.id, path);
    const wasActive = initialPath === renameTarget.path;
    setDocs((prev) =>
      prev
        .map((d) => (d.id === doc.id ? { ...d, path: doc.path, kind: doc.kind } : d))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    );
    if (wasActive) {
      setInitialPath(doc.path);
      const url = new URL(window.location.href);
      url.searchParams.set("p", doc.path);
      window.history.replaceState(null, "", url);
    }
    afterMutation();
  };

  const deleteFile = async () => {
    if (!deleteTarget) return;
    const removed = deleteTarget;
    await deleteDocumentRequest(project.id, removed.id);
    const remaining = docs.filter((d) => d.id !== removed.id);
    setDocs(remaining);
    if (initialPath === removed.path) {
      // Pick the neighbour: the next row, else the previous one.
      const idx = docs.findIndex((d) => d.id === removed.id);
      const neighbour = remaining[Math.min(idx, remaining.length - 1)];
      setInitialPath(neighbour?.path ?? null);
    }
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
          activePath={initialPath}
          activeSection={activeSection}
          hiddenFiles={preferences.hiddenFiles}
          onSectionChange={setActiveSection}
          onOpenDocument={openDocument}
          onNewFile={() => setNewFileOpen(true)}
          onRenameDocument={setRenameTarget}
          onDeleteDocument={setDeleteTarget}
          onDownloadDocument={download}
          onOpenSettings={() => {}}
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
        {/* Header block: 64 px tab row + 2 px rule + 16 px icon strip + 2 px rule. */}
        <div className="flex-none">
          <div
            data-testid="tab-strip-placeholder"
            className="flex h-16 items-center gap-2 border-b-2 border-[color:var(--border-log)] px-4"
          >
            {initialPath ? (
              <span
                role="tab"
                aria-selected="true"
                className="rounded bg-bg-app px-2 py-1 text-xs text-text-editor-primary"
              >
                {initialPath}
              </span>
            ) : null}
          </div>
          <div
            data-testid="editor-icon-strip"
            className="h-4 border-b-2 border-[color:var(--border-log)]"
          />
        </div>
        <Placeholder
          testId="editor-area-placeholder"
          label=""
          className="min-h-0 flex-1 overflow-hidden bg-bg-code"
        />
        <Placeholder
          testId="composer-slot-placeholder"
          label=""
          className="h-22 flex-none border-t border-[color:var(--border-log)]"
        />
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