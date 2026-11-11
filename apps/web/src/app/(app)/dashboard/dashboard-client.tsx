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
  const bannerShown = bannerEnabled && bannerVisible;

  return (
    <div
      data-testid="app-root"
      className="flex h-screen flex-col bg-bg-app p-2 text-fg-primary"
    >
      {bannerShown && (
        <div className="ml-2 shrink-0 pb-[10px]">
          <ShutdownBanner onClose={() => setBannerVisible(false)} />
        </div>
      )}
      <main
        data-testid="dashboard-card"
        className={`ml-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-dashboard-card-bg ${bannerShown ? "" : "mt-[1.735px]"}`}
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
