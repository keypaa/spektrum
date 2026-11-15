// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import {
  documents,
  pdfRenders,
  projects,
  snapshots,
  users,
} from "@spektrum/db/schema";
import { getObject, putObject } from "@spektrum/storage";
import { pruneRenders } from "./prune-renders";

const IT = process.env.STORAGE_IT === "1";
const run = Math.random().toString(36).slice(2, 10);
const userId = `prune-${run}`;
let projectId = "";

const DAY = 24 * 60 * 60_000;
const old = () => new Date(Date.now() - 30 * DAY);

const seed = async (count: number, opts: { old?: boolean; referenced?: boolean } = {}) => {
  const key = `prune/${run}/${crypto.randomUUID()}.pdf`;
  await putObject("pdf", key, "%PDF-1.4\n", "application/pdf");
  const [row] = await db
    .insert(pdfRenders)
    .values({
      projectId,
      revisionHash: crypto.randomUUID().replace(/-/g, ""),
      pdfKey: key,
      status: "ok",
      ...(opts.old ? { createdAt: old() } : {}),
    })
    .returning({ id: pdfRenders.id });
  if (opts.referenced && row) {
    await db.insert(snapshots).values({
      projectId,
      documentId: mainId,
      content: "x",
      batchId: row.id,
      authorId: userId,
    });
  }
  return { id: row!.id, key };
};

let mainId = "";

beforeAll(async () => {
  if (!IT) return;
  await db.insert(users).values({ id: userId, email: `prune-${run}@test.local`, name: "P" });
  const [p] = await db
    .insert(projects)
    .values({ ownerId: userId, name: "Prune" })
    .returning({ id: projects.id });
  projectId = p!.id;
  const [d] = await db
    .insert(documents)
    .values({ projectId, path: "main.tex", kind: "tex", content: "x" })
    .returning({ id: documents.id });
  mainId = d!.id;
});

afterAll(async () => {
  if (!IT) return;
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

describe.skipIf(!IT)("pruneRenders", () => {
  it("deletes only old renders that are neither recent nor snapshot-referenced", async () => {
    // 25 recent renders (all inside the 7-day window, so all kept), one old
    // render pinned by a snapshot, and one old render that nothing needs.
    for (let i = 0; i < 25; i += 1) await seed(1);
    const kept = await seed(1, { old: true, referenced: true });
    const dropped = await seed(1, { old: true });

    const report = await pruneRenders();

    const remaining = new Set(
      (await db.select({ id: pdfRenders.id }).from(pdfRenders)).map((r) => r.id),
    );
    expect(remaining.has(kept.id)).toBe(true);
    expect(remaining.has(dropped.id)).toBe(false);
    expect(remaining.size).toBe(26);

    // The object of the deleted row is gone from the bucket too.
    await expect(getObject("pdf", dropped.key)).rejects.toThrow();
    expect(report).toBeGreaterThan(0);
  });
});