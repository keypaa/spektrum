"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogAction, DialogCancel, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from "@spektrum/ui";
import { renameProjectAction } from "@/lib/actions";
import type { ProjectRow } from "@/lib/projects";

export function RenameDialog({
  project,
  onOpenChange,
}: {
  project: ProjectRow | null;
  onOpenChange: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (project) setName(project.name);
  }, [project]);

  const submit = async () => {
    if (!project || !name.trim() || pending) return;
    setPending(true);
    try {
      await renameProjectAction(project.id, name);
      onOpenChange();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={project !== null} onOpenChange={() => onOpenChange()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project name</DialogTitle>
          <DialogDescription>Enter a new name for your project.</DialogDescription>
        </DialogHeader>
        {/* The base Input is exactly the dialog input: h-10 (45 physical) and
            bg-background = #0a0a0a in dark, measured in ref 15. No overrides. */}
        <Input
          aria-label="Edit project name"
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
            Save
          </DialogAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
