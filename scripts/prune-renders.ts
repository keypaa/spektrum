// PDF/SyncTeX retention (spec §17 open item 5).
//
// A render is kept when it is one of the newest 20 for its project, or when a
// snapshot still references its batch. Everything else older than 7 days is
// deleted — the row and its two bucket objects — so the bucket does not grow
// without bound as papers are recompiled.
//
//   pnpm exec tsx scripts/prune-renders.ts
import { and, desc, inArray, lt, sql } from "drizzle-orm";
import { db } from "@spektrum/db";
import { pdfRenders, snapshots } from "@spektrum/db/schema";
import { deleteObject } from "@spektrum/storage";

const RETENTION_DAYS = 7;
const KEEP_PER_PROJECT = 20;

export type PruneReport = {
  candidates: number;
  deleted: number;
  objectsDeleted: number;
};

/** Delete pruned renders (rows + objects). Returns what it removed. */
export async function pruneRenders(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);

  // One query per project would be N+1; instead take the newest 20 ids per
  // project with a window function, then subtract them from the candidates.
  const keepRows = await db.execute(sql`
    select id from (
      select id, row_number() over (
        partition by ${pdfRenders.projectId}
        order by ${pdfRenders.createdAt} desc, ${pdfRenders.id} desc
      ) as rn
      from ${pdfRenders}
    ) ranked
    where rn <= ${KEEP_PER_PROJECT}
  `);
  const keepIds = (keepRows as unknown as Array<{ id: string }>).map((r) => r.id);

  // Snapshots pin the render they were written by, for as long as the snapshot
  // exists: restoring one must still have its PDF.
  const referenced = await db
    .selectDistinct({ batchId: snapshots.batchId })
    .from(snapshots)
    .where(sql`${snapshots.batchId} is not null`);
  const keepSet = new Set<string>([
    ...keepIds,
    ...referenced.map((r) => r.batchId).filter((id): id is string => id !== null),
  ]);

  const candidates = await db
    .select({
      id: pdfRenders.id,
      pdfKey: pdfRenders.pdfKey,
      synctexKey: pdfRenders.synctexKey,
    })
    .from(pdfRenders)
    .where(and(lt(pdfRenders.createdAt, cutoff), sql`${pdfRenders.status} <> 'queued'`));

  const removable = candidates.filter((row) => !keepSet.has(row.id));
  if (removable.length === 0) return 0;

  for (const row of removable) {
    for (const key of [row.pdfKey, row.synctexKey]) {
      if (!key) continue;
      await deleteObject("pdf", key).catch(() => undefined);
    }
  }

  await db.delete(pdfRenders).where(
    inArray(
      pdfRenders.id,
      removable.map((row) => row.id),
    ),
  );

  return removable.length;
}

/** Rows still stored per project, for the report. */
export async function countRenders(): Promise<number> {
  const rows = await db
    .select({ id: pdfRenders.id })
    .from(pdfRenders)
    .orderBy(desc(pdfRenders.createdAt));
  return rows.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const deleted = await pruneRenders();
  console.log(`pruned ${deleted} render(s); ${await countRenders()} remain`);
  const { pool } = await import("@spektrum/db");
  await pool.end();
}