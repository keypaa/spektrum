"use client";

import { useState } from "react";
import { IconMoreHorizontal } from "@spektrum/ui/icons";
import {
  Dialog,
  DialogAction,
  DialogCancel,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@spektrum/ui";

export interface ChatThreadSummary {
  id: string;
  title: string;
  titleSource: "fallback" | "llm" | "manual";
  hasAssistantReply: boolean;
  createdAt: string;
}

/** The Chats-tab list: newest first, one row per thread (spec §12.7). */
export function ChatList({
  threads,
  activeThreadId,
  aiEnabled,
  busy = false,
  onSelect,
  onRename,
  onDelete,
  onRegenerate,
}: {
  threads: ChatThreadSummary[];
  activeThreadId: string | null;
  aiEnabled: boolean;
  busy?: boolean;
  onSelect(thread: ChatThreadSummary): void;
  onRename(thread: ChatThreadSummary, title: string): void;
  onDelete(thread: ChatThreadSummary): void;
  onRegenerate(thread: ChatThreadSummary): void;
}): React.ReactElement {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChatThreadSummary | null>(null);

  const ordered = [...threads].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );

  const startRename = (thread: ChatThreadSummary): void => {
    setRenaming(thread.id);
    setDraft(thread.title);
  };

  const saveRename = (thread: ChatThreadSummary): void => {
    const title = draft.trim();
    if (title && title !== thread.title) onRename(thread, title);
    setRenaming(null);
  };

  return (
    <div className="flex flex-col gap-0.5">
      {ordered.map((thread) => (
        <div
          key={thread.id}
          data-testid={`chat-row-${thread.id}`}
          aria-current={activeThreadId === thread.id ? "page" : undefined}
          className="group flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-[color:var(--nav-bg-hover)]"
        >
          {renaming === thread.id ? (
            <Input
              aria-label="Chat title"
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveRename(thread);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setRenaming(null);
                }
              }}
              onBlur={() => saveRename(thread)}
              className="h-7 min-w-0 flex-1 text-xs"
            />
          ) : (
            <button
              type="button"
              onClick={() => onSelect(thread)}
              className="min-w-0 flex-1 truncate text-left text-xs text-text-editor-secondary hover:text-text-editor-primary"
            >
              {thread.title}
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${thread.title} actions`}
                className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-text-editor-tertiary opacity-0 transition-colors hover:bg-[color:var(--nav-bg-hover-strong)] hover:text-text-editor-primary focus-visible:opacity-100 data-[state=open]:opacity-100 group-hover:opacity-100"
              >
                <IconMoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" sideOffset={4} align="start" className="min-w-[200px]">
              <DropdownMenuItem
                disabled={busy || !thread.hasAssistantReply || !aiEnabled}
                onSelect={() => onRegenerate(thread)}
              >
                Regenerate title
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => startRename(thread)}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDeleteTarget(thread)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete chat</DialogTitle>
            <DialogDescription>
              This cannot be undone.{" "}
              {deleteTarget ? <span className="font-medium">{deleteTarget.title}</span> : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogCancel>Cancel</DialogCancel>
            <DialogAction
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) onDelete(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </DialogAction>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}