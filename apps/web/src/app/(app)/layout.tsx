import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireUser, UnauthorizedError } from "@/auth/session";
import { getPreferences } from "@/lib/preferences";
import { PreferencesProvider } from "@/components/preferences-provider";
import { SettingsModalHost } from "@/components/settings/settings-modal-host";

// Every signed-in screen (dashboard, editor) reads the user's preferences here
// and gets the provider and the settings modal host around it. The provider
// renders context only — no wrapper element — so the Phase 1 dashboard
// baselines do not move.
export default async function AppLayout({ children }: { children: ReactNode }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/login");
    throw e;
  }
  const preferences = await getPreferences(user.id);
  return (
    <PreferencesProvider initial={preferences}>
      <SettingsModalHost>{children}</SettingsModalHost>
    </PreferencesProvider>
  );
}