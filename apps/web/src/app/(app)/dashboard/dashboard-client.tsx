"use client";

import { useState } from "react";
import type { ProjectRow } from "@/lib/projects";
import { ShutdownBanner } from "./shutdown-banner";
import { DashboardHeader } from "./header";
import type { Layout } from "./layout-toggle";
import { ProjectList } from "./project-list";
import { AccountChip } from "./account-chip";
import type { Sort } from "./column-header";

export type { Sort, SortDirection, SortKey } from "./column-header";

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
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<Layout>("list");
  const [sort, setSort] = useState<Sort>({ key: "created", direction: "desc" });

  return (
    <div
      data-testid="app-root"
      className="flex h-screen flex-col bg-bg-app p-2 text-fg-primary"
    >
      {/* Bundle `_k`: the banner sits inside the app-root p-2 gutter; pb-2 keeps
          the 8 CSS gap before the card (which follows after 8 + mt-0.5 = 10 CSS,
          measured: banner y 62–117, card top y 130 in the full capture). */}
      {bannerEnabled && bannerVisible && (
        <div className="shrink-0 pb-2">
          <ShutdownBanner onClose={() => setBannerVisible(false)} />
        </div>
      )}
      <main
        data-testid="dashboard-card"
        className="ml-2 mt-0.5 min-h-0 flex-1 rounded-xl bg-dashboard-card-bg"
      >
        <DashboardHeader
          query={query}
          onQueryChange={setQuery}
          layout={layout}
          onLayoutChange={setLayout}
        />
        <ProjectList
          projects={projects}
          query={query}
          layout={layout}
          sort={sort}
          onSort={setSort}
        />
      </main>
      <AccountChip userName={userName} userEmail={userEmail} />
    </div>
  );
}
