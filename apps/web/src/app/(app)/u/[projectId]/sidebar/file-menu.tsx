"use client";

import { IconMoreHorizontal } from "@spektrum/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spektrum/ui";

/** The per-row overflow menu: Rename / Download / Delete (bundle `TB`
 *  @1177197 renders the same three as a context menu). */
export function FileMenu({
  path,
  onRename,
  onDelete,
  onDownload,
}: {
  path: string;
  onRename(): void;
  onDelete(): void;
  onDownload(): void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${path} actions`}
          className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-text-editor-tertiary transition-colors hover:bg-[color:var(--nav-bg-hover-strong)] hover:text-text-editor-primary data-[state=open]:bg-[color:var(--nav-bg-hover-strong)]"
        >
          <IconMoreHorizontal size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" sideOffset={4} align="start" className="min-w-[220px]">
        <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={onDownload}>Download</DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}