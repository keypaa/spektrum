"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@spektrum/ui";
import { IconChevronDown, IconPlus } from "@spektrum/ui/icons";
import { createBlankProject, createExampleProject } from "@/lib/actions";
import { NewFolderDialog } from "./new-folder-dialog";

export function NewMenu() {
  const router = useRouter();
  const [folderOpen, setFolderOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <IconPlus size={16} />
            New
            <IconChevronDown size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent sideOffset={8} align="end" className="min-w-[200px]">
          {/* Prism drops you straight into the new project; leaving the user on
              the dashboard with a fresh row was an extra click nobody asked
              for. */}
          <DropdownMenuItem
            onSelect={() => void createBlankProject().then((id) => router.push(`/u/${id}`))}
          >
            Blank project
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void createExampleProject().then((id) => router.push(`/u/${id}`))}
          >
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
