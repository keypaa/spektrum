// Boot recovery (spec §11.2): a worker killed mid-compile must not leave a
// render row stuck in `running` or a per-project lock held for its full TTL.

import { and, eq, lt } from "drizzle-orm";
import { db } from "@spektrum/db";
import { pdfRenders } from "@spektrum/db/schema";
import { LOCK_PREFIX } from "./queue";

const STALE_MS = 2 * 60_000;

/** Mark `running` rows older than two minutes as `error`. */
export async function recoverStaleRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MS);
  const rows = await db
    .update(pdfRenders)
    .set({ status: "error", log: "worker restarted" })
    .where(
      and(eq(pdfRenders.status, "running"), lt(pdfRenders.createdAt, cutoff)),
    )
    .returning({ id: pdfRenders.id });
  return rows.length;
}

export interface ScanRedis {
  scan(
    cursor: string,
    ...args: unknown[]
  ): Promise<[string, string[]]>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

/** Delete compile locks whose value (a timestamp) is older than two minutes. */
export async function recoverStaleLocks(redis: ScanRedis): Promise<number> {
  let cursor = "0";
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      `${LOCK_PREFIX}*`,
      "COUNT",
      100,
    );
    cursor = next;
    for (const key of keys) {
      const value = await redis.get(key);
      const at = Number(value);
      if (Number.isFinite(at) && Date.now() - at > STALE_MS) {
        await redis.del(key);
        removed += 1;
      }
    }
  } while (cursor !== "0");
  return removed;
}