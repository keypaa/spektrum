import type { SyncTexMap } from "@spektrum/shared";

/** Fetch the compact SyncTeX map for a render (null when absent). */
export async function fetchSyncTex(
  projectId: string,
  revision: string,
): Promise<SyncTexMap | null> {
  try {
    const res = await fetch(
      `/api/projects/${projectId}/render/${revision}/synctex`,
    );
    if (!res.ok) return null;
    return (await res.json()) as SyncTexMap;
  } catch {
    return null;
  }
}