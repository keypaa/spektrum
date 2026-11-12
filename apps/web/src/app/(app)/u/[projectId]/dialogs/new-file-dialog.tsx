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
import {
  DUPLICATE_PATH_MESSAGE,
  normalizeNewFileName,
} from "@/lib/document-client";

export function NewFileDialog({
  open,
  existingPaths,
  onSubmit,
  onOpenChange,
}: {
  open: boolean;
  existingPaths: string[];
  onSubmit(path: string): Promise<void>;
  onOpenChange(open: boolean): void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const path = normalizeNewFileName(name);
    if (!path || pending) return;
    if (existingPaths.includes(path)) {
      setError(DUPLICATE_PATH_MESSAGE);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(path);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : DUPLICATE_PATH_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New file</DialogTitle>
          <DialogDescription>Enter a file name.</DialogDescription>
        </DialogHeader>
        <Input
          aria-label="File name"
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
        {error ? (
          <p role="alert" className="text-xs text-fg-error">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogCancel disabled={pending}>Cancel</DialogCancel>
          <DialogAction
            disabled={pending || !name.trim()}
            onClick={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            Create
          </DialogAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}