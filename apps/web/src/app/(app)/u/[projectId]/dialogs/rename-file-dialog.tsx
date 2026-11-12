"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogAction,
  DialogCancel,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@spektrum/ui";
import { DUPLICATE_PATH_MESSAGE } from "@/lib/document-client";
import type { DocumentSummary } from "@/lib/documents";

export function RenameFileDialog({
  document: doc,
  existingPaths,
  onSubmit,
  onOpenChange,
}: {
  document: DocumentSummary | null;
  existingPaths: string[];
  onSubmit(path: string): Promise<void>;
  onOpenChange(open: boolean): void;
}) {
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (doc) {
      setPath(doc.path);
      setError(null);
    }
  }, [doc]);

  const submit = async () => {
    const trimmed = path.trim();
    if (!trimmed || !doc || pending) return;
    if (trimmed === doc.path) return;
    if (existingPaths.includes(trimmed)) {
      setError(DUPLICATE_PATH_MESSAGE);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : DUPLICATE_PATH_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={doc !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename file</DialogTitle>
          <DialogDescription>Enter a new name for the file.</DialogDescription>
        </DialogHeader>
        <Input
          aria-label="File name"
          autoFocus
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {error ? (
          <p role="alert" className="text-xs text-fg-error">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogCancel disabled={pending}>Cancel</DialogCancel>
          <DialogAction
            disabled={pending || !path.trim() || path.trim() === doc?.path}
            onClick={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            Save
          </DialogAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}