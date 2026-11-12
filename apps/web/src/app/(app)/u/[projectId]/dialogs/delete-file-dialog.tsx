"use client";

import { useState } from "react";
import {
  Dialog,
  DialogAction,
  DialogCancel,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@spektrum/ui";
import type { DocumentSummary } from "@/lib/documents";

export function DeleteFileDialog({
  document: doc,
  onConfirm,
  onOpenChange,
}: {
  document: DocumentSummary | null;
  onConfirm(): Promise<void>;
  onOpenChange(open: boolean): void;
}) {
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    if (!doc || pending) return;
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={doc !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete file</DialogTitle>
          <DialogDescription>
            This cannot be undone. {doc ? <span className="font-medium">{doc.path}</span> : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogCancel disabled={pending}>Cancel</DialogCancel>
          <DialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            Delete
          </DialogAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}