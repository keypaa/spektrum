import { syncTexMapSchema, type SyncTexMap } from "@spektrum/shared/compile";

/**
 * Fetch the compact SyncTeX map for a committed render. The server checks
 * ownership before minting a short-lived signed GET URL for the render's key;
 * this client never sees (or trusts) a raw object key.
 */
export async function fetchSyncTex(
  projectId: string,
  revision: string,
): Promise<SyncTexMap | null> {
  try {
    const signed = await fetch(
      `/api/projects/${projectId}/render/${revision}/synctex/url`,
      { cache: "no-store" },
    );
    if (!signed.ok) return null;
    const { url } = (await signed.json()) as { url?: string };
    if (!url) return null;

    const res = await fetch(url);
    if (!res.ok) return null;
    const parsed = syncTexMapSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
