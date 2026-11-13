"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@spektrum/ui";
import { SHORTCUT_ROWS } from "./rows";

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription className="sr-only">
          The editor's keyboard shortcuts.
        </DialogDescription>
        <ul className="flex flex-col">
          {SHORTCUT_ROWS.map(([label, shortcut]) => (
            <li
              key={label}
              className="flex items-center justify-between gap-4 py-1.5 text-sm"
            >
              <span className="text-text-editor-primary">{label}</span>
              <span className="text-xs text-text-editor-tertiary">{shortcut}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}