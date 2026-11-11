"use client";

import { useState } from "react";
import type { ProjectRow } from "@/lib/projects";
import { ShutdownBanner } from "./shutdown-banner";
import { DashboardHeader } from "./header";
import { ProjectList } from "./project-list";
import { AccountChip } from "./account-chip";

export function DashboardClient({
  userName,
  userEmail,
  projects,
  bannerEnabled,
}: {
  userName: string;
  userEmail: string;
  projects: ProjectRow[];
  bannerEnabled: boolean;
}) {
  const [bannerVisible, setBannerVisible] = useState(true);

  return (
    <div
      data-testid="app-root"
      className="flex h-screen flex-col bg-bg-app p-2 text-fg-primary"
    >
      {/* Bundle `_k`: the banner sits in a `px-2 pt-2` (plus `pb-2`) wrapper,
          so its box is inset 8 CSS on the top/sides and the card follows after
          8 + 2 (`mt-0.5`) CSS — measured: banner y 62–117, card top y 130. */}
      {bannerEnabled && bannerVisible && (
        <div className="shrink-0 px-2 pb-2 pt-2">
          <ShutdownBanner onClose={() => setBannerVisible(false)} />
        </div>
      )}
      <main
        data-testid="dashboard-card"
        className="ml-2 mt-0.5 min-h-0 flex-1 rounded-xl bg-dashboard-card-bg"
      >
        <DashboardHeader />
        <ProjectList projects={projects} />
      </main>
      <AccountChip userName={userName} userEmail={userEmail} />
    </div>
  );
}
