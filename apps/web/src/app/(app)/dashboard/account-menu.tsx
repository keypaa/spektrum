"use client";

import { useRouter } from "next/navigation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@spektrum/ui";
import { IconFeedback, IconKeyboard, IconLogOut, IconMail, IconSettings } from "@spektrum/ui/icons";
import { authClient } from "@/auth/client";

export function AccountMenu({
  userEmail,
  trigger,
}: {
  userEmail: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();

  // Better Auth has no `nextCookies()` plugin in this app, so a server action
  // cannot clear the session cookie. The browser client hits
  // /api/auth/sign-out, which sets the cleared cookie on the response.
  const signOut = async () => {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      {/* Bundle `mG`: side="top", align="start", sideOffset 8, width = the
          trigger's available width capped at 300 px. */}
      <DropdownMenuContent side="top" sideOffset={8} align="start" className="max-w-[300px]">
        <DropdownMenuItem onSelect={() => {/* Phase 2: settings modal */}}>
          <IconSettings size={16} />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => {/* Phase 2: keyboard shortcuts */}}>
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
  );
}