"use client";

import { IconChevronExpand, IconUser } from "@spektrum/ui/icons";
import { AccountMenu } from "./account-menu";

export function AccountChip({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  return (
    <AccountMenu
      userEmail={userEmail}
      trigger={
        <button
          type="button"
          data-testid="account-chip"
          className="ml-2 mt-[18px] flex w-fit items-start gap-1.5 self-start rounded-lg px-5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg"
        >
          {/* Bundle `mK` fallback avatar: 28 px, bg-button-secondary-bg,
              text-button-secondary-text, initial uppercase. */}
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-button-secondary-bg text-sm font-medium text-button-secondary-text">
            {userName.charAt(0).toUpperCase()}
          </span>
          <span className="flex flex-col">
            <span className="flex items-center gap-1 text-sm font-medium text-fg-primary">
              <span className="truncate">{userName}</span>
              <IconChevronExpand size={12} className="text-fg-tertiary" />
            </span>
            <span className="flex items-center gap-1 text-xs text-fg-tertiary">
              <IconUser size={12} />
              Personal workspace
            </span>
          </span>
        </button>
      }
    />
  );
}
