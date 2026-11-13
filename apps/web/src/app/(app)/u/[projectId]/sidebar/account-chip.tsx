"use client";

import { AccountMenu } from "@/app/(app)/dashboard/account-menu";

/** The editor's bottom user chip: the same account menu as the dashboard. */
export function AccountChip({
  user,
}: {
  user: { name: string; email: string };
}) {
  return (
    <div className="flex h-14 flex-none items-center border-t border-[color:var(--border-log)] px-4">
      <AccountMenu
        userEmail={user.email}
        trigger={
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
        }
      />
    </div>
  );
}