"use client";

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@spektrum/ui";
import { IconChevronDown } from "@spektrum/ui/icons";

export function ImportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="justify-between">
          Import
          <IconChevronDown size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={9} align="end" className="min-w-[200px]">
        <DropdownMenuItem onSelect={() => {/* Phase 5: import archive */}}>
          Import archive (.zip, .tar.gz)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => {/* Phase 5: import folder */}}>
          Import Folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
