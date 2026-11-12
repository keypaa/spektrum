"use client";

import type { DocumentSummary } from "@/lib/documents";
import { kindIcon } from "./project-sidebar";
import { FileMenu } from "./file-menu";

export function FileRow({
  doc,
  active,
  onOpen,
  onRename,
  onDelete,
  onDownload,
}: {
  doc: DocumentSummary;
  active: boolean;
  onOpen(): void;
  onRename(): void;
  onDelete(): void;
  onDownload(): void;
}) {
  const Icon = kindIcon(doc.kind);
  return (
    <div
      data-testid={`file-row-${doc.path}`}
      aria-current={active ? "page" : undefined}
      className={`flex h-8 min-w-0 items-center gap-2 rounded-lg pl-2 pr-1 text-sm transition-colors ${
        active
          ? "bg-nav-bg-active text-text-editor-primary"
          : "text-text-editor-secondary hover:bg-[color:var(--nav-bg-hover-strong)] hover:text-text-editor-primary"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 bg-transparent text-left"
      >
        <Icon size={14} className="flex-none" />
        <span className="min-w-0 flex-1 truncate">{doc.path}</span>
      </button>
      <FileMenu
        path={doc.path}
        onRename={onRename}
        onDelete={onDelete}
        onDownload={onDownload}
      />
    </div>
  );
}