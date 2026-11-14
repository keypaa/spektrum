// Versions (spec §9.2): one snapshot per changed text document at a successful
// compile, grouped by `batch_id` (the pdf_renders.id), restored per batch.
// Blob documents are skipped: `snapshots.content` is NOT NULL.

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "./client";
import {
  documents,
  pdfRenders,
  projects,
  snapshots,
  users,
} from "./schema";

const hash = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex");

async function latestRenderId(projectId: string): Promise<string> {
  const [row] = await db
    .select({ id: pdfRenders.id })
    .from(pdfRenders)
    .where(and(eq(pdfRenders.projectId, projectId), eq(pdfRenders.status, "ok")))
    .orderBy(desc(pdfRenders.createdAt))
    .limit(1);
  return row?.id ?? crypto.randomUUID();
}

/** Snapshot every changed text document after a successful compile. */
export async function snapshotAfterCompile(
  projectId: string,
  authorId: string,
): Promise<number> {
  const batchId = await latestRenderId(projectId);
  const docs = await db
    .select({ id: documents.id, content: documents.content })
    .from(documents)
    .where(
      and(eq(documents.projectId, projectId), isNotNull(documents.content)),
    );

  const previous = await db
    .select({
      documentId: snapshots.documentId,
      content: snapshots.content,
      createdAt: snapshots.createdAt,
    })
    .from(snapshots)
    .where(eq(snapshots.projectId, projectId))
    .orderBy(desc(snapshots.createdAt));

  const newest = new Map<string, string>();
  for (const row of previous) {
    if (!newest.has(row.documentId)) newest.set(row.documentId, row.content);
  }

  let inserted = 0;
  for (const document of docs) {
    const content = document.content ?? "";
    if (newest.get(document.id) === content) continue;
    await db.insert(snapshots).values({
      projectId,
      documentId: document.id,
      content,
      batchId,
      authorId,
    });
    inserted += 1;
  }

  await pruneSnapshots(projectId);
  return inserted;
}

/** Keep the newest 50 snapshot rows for a project (deterministic tie-break). */
export async function pruneSnapshots(
  projectId: string,
  keep = 50,
): Promise<number> {
  const rows = await db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(eq(snapshots.projectId, projectId))
    .orderBy(desc(snapshots.createdAt), desc(snapshots.id));
  const stale = rows.slice(keep).map((row) => row.id);
  if (stale.length === 0) return 0;
  await db.delete(snapshots).where(inArray(snapshots.id, stale));
  return stale.length;
}

export interface SnapshotRow {
  id: string;
  batchId: string | null;
  documentId: string;
  path: string;
  createdAt: string;
  author: string;
}

export async function listSnapshots(
  userId: string,
  projectId: string,
): Promise<SnapshotRow[]> {
  const rows = await db
    .select({
      id: snapshots.id,
      batchId: snapshots.batchId,
      documentId: snapshots.documentId,
      path: documents.path,
      createdAt: snapshots.createdAt,
      author: users.name,
    })
    .from(snapshots)
    .innerJoin(
      projects,
      and(
        eq(projects.id, snapshots.projectId),
        eq(projects.ownerId, userId),
        sql`${projects.deletedAt} is null`,
      ),
    )
    .innerJoin(documents, eq(documents.id, snapshots.documentId))
    .innerJoin(users, eq(users.id, snapshots.authorId))
    .where(eq(snapshots.projectId, projectId))
    .orderBy(desc(snapshots.createdAt), desc(snapshots.id));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Restore one snapshot into its document (ownership-checked). */
export async function restoreSnapshot(
  userId: string,
  projectId: string,
  snapshotId: string,
): Promise<{ documentId: string; path: string; content: string } | null> {
  const [row] = await db
    .select({
      documentId: snapshots.documentId,
      content: snapshots.content,
      path: documents.path,
    })
    .from(snapshots)
    .innerJoin(
      projects,
      and(
        eq(projects.id, snapshots.projectId),
        eq(projects.ownerId, userId),
        sql`${projects.deletedAt} is null`,
      ),
    )
    .innerJoin(documents, eq(documents.id, snapshots.documentId))
    .where(and(eq(snapshots.id, snapshotId), eq(snapshots.projectId, projectId)));
  if (!row) return null;

  await db
    .update(documents)
    .set({ content: row.content, updatedAt: new Date() })
    .where(and(eq(documents.id, row.documentId), eq(documents.projectId, projectId)));
  return row;
}

/** Restore every snapshot in a compile batch (ownership-checked). */
export async function restoreSnapshots(
  userId: string,
  projectId: string,
  batchId: string,
): Promise<number> {
  const rows = await db
    .select({ documentId: snapshots.documentId, content: snapshots.content })
    .from(snapshots)
    .innerJoin(
      projects,
      and(
        eq(projects.id, snapshots.projectId),
        eq(projects.ownerId, userId),
        sql`${projects.deletedAt} is null`,
      ),
    )
    .where(and(eq(snapshots.batchId, batchId), eq(snapshots.projectId, projectId)));
  for (const row of rows) {
    await db
      .update(documents)
      .set({ content: row.content, updatedAt: new Date() })
      .where(and(eq(documents.id, row.documentId), eq(documents.projectId, projectId)));
  }
  return rows.length;
}

export { hash as snapshotHash };