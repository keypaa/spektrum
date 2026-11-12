"use client";

import { useMemo, useState } from "react";
import {
  IconChevronDown,
  IconFile,
  IconFileBib,
  IconFileCsv,
  IconFileImage,
  IconFileTex,
  IconPlus,
  IconSearch,
} from "@spektrum/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spektrum/ui";
import type { DocumentSummary, DocumentKind } from "@/lib/documents";
import { matchHiddenFile } from "@/lib/hidden-files";
import { FileRow } from "./file-row";

export interface ProjectSidebarProps {
  project: { id: string; name: string };
  documents: DocumentSummary[];
  activePath: string | null;
  activeSection: "files" | "chats";
  hiddenFiles?: readonly string[];
  onSectionChange(section: "files" | "chats"): void;
  onOpenDocument(path: string): void;
  onNewFile(): void;
  onRenameDocument(doc: DocumentSummary): void;
  onDeleteDocument(doc: DocumentSummary): void;
  onDownloadDocument(doc: DocumentSummary): void;
  onOpenSettings(): void;
  user: { name: string; email: string };
}

export function kindIcon(kind: DocumentKind): typeof IconFile {
  switch (kind) {
    case "tex":
      return IconFileTex;
    case "bib":
      return IconFileBib;
    case "csv":
      return IconFileCsv;
    case "img":
      return IconFileImage;
    default:
      return IconFile;
  }
}

export function ProjectSidebar({
  project,
  documents,
  activePath,
  activeSection,
  hiddenFiles = [],
  onSectionChange,
  onOpenDocument,
  onNewFile,
  onRenameDocument,
  onDeleteDocument,
  onDownloadDocument,
  onOpenSettings,
  user,
}: ProjectSidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents
      .filter((d) => !matchHiddenFile(d.path, hiddenFiles))
      .filter((d) => (needle ? d.path.toLowerCase().includes(needle) : true))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }, [documents, hiddenFiles, query]);

  return (
    <div
      data-testid="project-sidebar"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-bg-sidepanel"
    >
      {/* Header: project name dropdown trigger (inert in Phase 2) + avatar. */}
      <div className="mx-3 mt-1 flex flex-row items-center gap-2">
        <button
          type="button"
          aria-haspopup="menu"
          aria-label={`Open project menu`}
          className="flex min-h-9 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border border-[color:var(--border-outline)] px-3 py-1.5 text-left text-sm outline-none transition-colors hover:border-[color:var(--border-modal)] hover:bg-nav-bg-hover"
        >
          <span className="min-w-0 flex-1 select-none overflow-hidden text-ellipsis text-nowrap font-medium">
            {project.name}
          </span>
          <IconChevronDown size={16} className="flex-none" />
        </button>
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-button-secondary-bg text-sm font-medium text-button-secondary-text ring-2 ring-bg-app">
          {user.name.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Files / Chats underline row with the search and plus buttons. */}
      <div className="mt-3 px-4">
        <div className="-mx-4 flex gap-3 px-4">
          {(["files", "chats"] as const).map((tab) => {
            const active = activeSection === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSectionChange(tab)}
                className={`flex h-10 cursor-pointer items-start pt-1.5 text-sm transition-colors ${
                  active
                    ? "text-text-editor-primary"
                    : "text-text-editor-secondary hover:text-text-editor-primary"
                }`}
              >
                <span
                  className={`border-b-2 pb-1 ${
                    active ? "border-text-editor-primary" : "border-transparent"
                  }`}
                >
                  {tab === "files" ? "Files" : "Chats"}
                </span>
              </button>
            );
          })}
          <div className="-mr-2 ml-auto flex items-center gap-1 pb-2">
            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen((v) => !v)}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-text-editor-secondary hover:text-text-editor-primary"
            >
              <IconSearch size={16} />
            </button>
            {activeSection === "files" ? (
              <button
                type="button"
                aria-label="New file"
                onClick={onNewFile}
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-text-editor-secondary hover:text-text-editor-primary"
              >
                <IconPlus size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Search field (revealed by the search button). */}
      {searchOpen ? (
        <div className="px-4 pt-2">
          <input
            type="text"
            aria-label="Search"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-full rounded-lg border border-[color:var(--border-outline)] bg-bg-app px-2 text-xs text-text-editor-primary placeholder:text-text-editor-tertiary"
          />
        </div>
      ) : null}

      {/* File list. */}
      <div
        data-testid="file-list"
        className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {activeSection === "chats" ? (
          <div className="flex flex-col items-center px-2 py-6 text-center text-sm text-text-editor-tertiary">
            No chats yet
          </div>
        ) : visible.length === 0 && query ? (
          <div className="px-2 py-2 text-sm text-text-editor-tertiary">
            No files match your search.
          </div>
        ) : (
          visible.map((doc) => (
            <FileRow
              key={doc.id}
              doc={doc}
              active={activePath === doc.path}
              onOpen={() => onOpenDocument(doc.path)}
              onRename={() => onRenameDocument(doc)}
              onDelete={() => onDeleteDocument(doc)}
              onDownload={() => onDownloadDocument(doc)}
            />
          ))
        )}
      </div>

      {/* Bottom user chip: opens the account menu in Task 10+; here it opens
          settings via the account menu (wired in Task 17). */}
      <div className="flex h-14 flex-none items-center gap-2 border-t border-[color:var(--border-log)] px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${user.name} account`}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[color:var(--nav-bg-hover-strong)]"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-button-secondary-bg text-sm font-medium text-button-secondary-text ring-2 ring-bg-app">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs text-text-nav-primary">{user.name}</span>
                <span className="truncate text-xs text-text-nav-tertiary">Personal workspace</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" sideOffset={8} align="start" className="max-w-[300px]">
            <DropdownMenuItem onSelect={onOpenSettings}>Settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}