"use client";

import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@spektrum/ui";
import { IconMoreHorizontal } from "@spektrum/ui/icons";
import { deleteProjectAction, duplicateProjectAction } from "@/lib/actions";
import type { ProjectRow } from "@/lib/projects";

export function RowMenu({
  project,
  onRename,
  layout = "list",
}: {
  project: ProjectRow;
  onRename: (project: ProjectRow) => void;
  layout?: "list" | "grid";
}) {
  return (
    // Bundle: the menu cell wrapper is `text-fg-tertiary flex-none py-2` in list
    // mode (this py-2 is what makes the row 50 CSS tall) and `absolute right-0
    // top-0` in grid mode.
    <div className={cn("flex-none text-fg-tertiary", layout === "grid" ? "absolute right-0 top-0" : "py-2")}>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${project.name} actions`}
          className={cn(
            "flex items-center justify-center rounded-md p-2 text-fg-tertiary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg",
            // Grid cards reveal the ⋯ on hover only (bundle behaviour); the
            // list keeps it always visible, which is what ref 46 shows.
            layout === "grid" && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          <IconMoreHorizontal size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent sideOffset={9} align="end" className="min-w-[200px]">
          <DropdownMenuItem onSelect={() => onRename(project)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void duplicateProjectAction(project.id)}>
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void deleteProjectAction(project.id)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
