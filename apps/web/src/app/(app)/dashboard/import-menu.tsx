"use client";

import { useState } from "react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@spektrum/ui";
import { IconChevronDown } from "@spektrum/ui/icons";
import { ImportDialog } from "@/components/import/import-dialog";

export function ImportMenu() {
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary">
            Import
            <IconChevronDown size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent sideOffset={9} align="end" className="min-w-[200px]">
          <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
            Import archive (.zip, .tar.gz)
          </DropdownMenuItem>
          <DropdownMenuItem disabled aria-disabled="true">
            Import Folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ImportDialog open={archiveOpen} onOpenChange={setArchiveOpen} />
    </>
  );
}