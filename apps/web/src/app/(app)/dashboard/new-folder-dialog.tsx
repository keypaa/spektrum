"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogAction, DialogCancel, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from "@spektrum/ui";
import { createFolderAction } from "@/lib/actions";

export function NewFolderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    try {
      await createFolderAction(trimmed);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>Create a folder to organize your projects.</DialogDescription>
        </DialogHeader>
        {/* Base Input as-is: h-10, bg-background (#0a0a0a dark) — see Task 11. */}
        <Input
          aria-label="New folder"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <DialogFooter>
          <DialogCancel disabled={pending}>Cancel</DialogCancel>
          <DialogAction
            disabled={pending || !name.trim()}
            onClick={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            Create folder
          </DialogAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
