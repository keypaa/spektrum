"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spektrum/ui";

/** The bottom user chip (spec §6.3). The account menu reuses the dashboard's
 *  menu items; only Settings is wired in Phase 2 (the shortcuts dialog arrives
 *  with Task 17, feedback/sign-out keep the dashboard behaviour). */
export function AccountChip({
  user,
  onOpenSettings,
}: {
  user: { name: string; email: string };
  onOpenSettings(): void;
}) {
  return (
    <div className="flex h-14 flex-none items-center border-t border-[color:var(--border-log)] px-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${user.name} account`}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[color:var(--nav-bg-hover-strong)]"
          >
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-button-secondary-bg text-sm font-medium text-button-secondary-text ring-2 ring-bg-app">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs text-text-nav-primary">{user.name}</span>
              <span className="truncate text-xs text-text-nav-tertiary">Personal workspace</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" sideOffset={8} align="start" className="max-w-[300px]">
          <DropdownMenuItem onSelect={onOpenSettings}>Settings</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}