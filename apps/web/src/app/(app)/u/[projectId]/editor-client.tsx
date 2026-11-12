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
import type {
  DocumentRecord,
  DocumentSummary,
} from "@/lib/documents";
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
  const initialPath = initialDocument?.path ?? null;
  return (
    <div
      data-testid="editor-root"
      // CSS vars overrid[...] by Task 10's resizable sidebar.
      style={
        {
          "--sidebar-width": "442px",
          "--right-pane-width": "677px",
        } as React.CSSProperties
      }
      className="grid h-screen grid-cols-[var(--sidebar-width)_minmax(480px,1fr)_var(--right-pane-width)] overflow-hidden pr-4"
    >
      {/* Sidebar placeholder (Task 10): header + Files/Chats tabs + file list. */}
      <div
        data-testid="sidebar-placeholder"
        className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-[color:var(--border-log)] bg-bg-sidepanel"
      >
        <div className="flex h-16 flex-none items-center px-4">
          <span className="truncate text-sm font-medium text-text-nav-primary">
            {project.name}
          </span>
        </div>
        <div className="flex flex-none gap-4 px-4 text-sm">
          <span className="border-b-2 border-text-editor-primary pb-1 text-text-editor-primary">
            Files
          </span>
          <span className="pb-1 text-text-editor-secondary">Chats</span>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex h-8 items-center rounded-lg px-3 text-sm text-text-editor-secondary"
            >
              {doc.path}
            </div>
          ))}
        </div>
        {/* Bottom user chip (spec §6.3; the account menu is Task 10). */}
        <div className="flex h-14 flex-none items-center gap-2 border-t border-[color:var(--border-log)] px-4">
          <span className="truncate text-xs text-text-nav-secondary">{user.name}</span>
          <span className="truncate text-xs text-text-nav-tertiary">Personal workspace</span>
        </div>
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
    </div>
  );
}