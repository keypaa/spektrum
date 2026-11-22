"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@spektrum/ui";
import { IconFeedback, IconKeyboard, IconLogOut, IconMail, IconSettings } from "@spektrum/ui/icons";
import { authClient } from "@/auth/client";
import { useSettingsModal } from "@/components/settings/settings-modal-host";
import { ShortcutsDialog } from "@/components/shortcuts/shortcuts-dialog";

export function AccountMenu({
  userEmail,
  trigger,
  side = "top",
}: {
  userEmail: string;
  trigger: React.ReactNode;
  side?: "top" | "bottom";
}) {
  const router = useRouter();
  const { open: openSettings } = useSettingsModal();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Better Auth has no `nextCookies()` plugin in this app, so a server action
  // cannot clear the session cookie. The browser client hits
  // /api/auth/sign-out, which sets the cleared cookie on the response.
  const signOut = async () => {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        {/* Bundle `mG`: align="start", sideOffset 8, width = the trigger's
          available width capped at 300 px. The sidebar's compact avatar sits
          near the top of the viewport, so its menu opens downward. */}
        <DropdownMenuContent side={side} sideOffset={8} align="start" className="max-w-[300px]">
          <DropdownMenuItem onSelect={() => openSettings()}>
            <IconSettings size={16} />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
            <IconKeyboard size={16} />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {/* Phase 2: feedback */}}>
            <IconFeedback size={16} />
            Give feedback
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => window.open(`mailto:${userEmail}`, "_blank")}>
            <IconMail size={16} />
            {userEmail}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <IconLogOut size={16} />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}