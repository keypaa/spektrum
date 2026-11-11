"use client";

import { useState } from "react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@spektrum/ui";
import { IconChevronDown, IconPlus } from "@spektrum/ui/icons";
import { createBlankProject, createExampleProject } from "@/lib/actions";
import { NewFolderDialog } from "./new-folder-dialog";

export function NewMenu() {
  const [folderOpen, setFolderOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="justify-between">
            <IconPlus size={16} />
            New
            <IconChevronDown size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent sideOffset={8} align="end" className="min-w-[200px]">
          <DropdownMenuItem onSelect={() => void createBlankProject()}>
            Blank project
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void createExampleProject()}>
            Example project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setFolderOpen(true)}>New folder</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewFolderDialog open={folderOpen} onOpenChange={setFolderOpen} />
    </>
  );
}
