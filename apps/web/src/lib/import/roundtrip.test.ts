// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { projects, users } from "@spektrum/db/schema";
import { ensureBucket } from "@spektrum/storage";
import { importArchive } from "./import-archive";
import { buildProjectExport } from "../export/build-export";
import { readZip } from "./zip";

const run = Math.random().toString(36).slice(2, 10);
const userId = `rt-${run}`;
const userId2 = `rt2-${run}`;

const FIXTURE = resolve(import.meta.dirname, "../../../../../e2e/fixtures/prism-projects-2026-11-05.zip");
const fixture = () => new Uint8Array(readFileSync(FIXTURE));
// The archive is local-only (real papers + chat transcripts); the round trip
// needs both it and a bucket.
const hasFixture = existsSync(FIXTURE);
const tex = (entries: ReturnType<typeof readZip>) => entries.filter((e) => e.path.endsWith(".tex")).map((e) => `${e.path}\0${new TextDecoder().decode(e.data)}`).sort();

beforeAll(async () => {
  process.env.STORAGE_IT = "1";
  await db.insert(users).values([
    { id: userId, email: `rt-${run}@test.local`, name: "R" },
    { id: userId2, email: `rt2-${run}@test.local`, name: "R2" },
  ]);
  if (!process.env.STORAGE_IT) return;
  // The archive's images/PDFs go to the `uploads` bucket; make sure it exists
  // (mirrors the bootstrap in packages/storage/src/index.test.ts).
  await ensureBucket("uploads");
});
// Every row this file creates is removed even when an assertion fails:
// `tools.test.ts` asserts on `documents` without a project filter, so a
// leftover row there would make an unrelated test non-deterministic.
afterAll(async () => {
  await db.delete(users).where(inArray(users.id, [userId, userId2]));
  await pool.end();
});

// The real archive contains images/PDFs that go through S3; skip where no bucket.
describe.skipIf(!process.env.STORAGE_IT || !hasFixture)("Prism round trip", () => {
  it("imports, exports and re-imports with every .tex byte identical", async () => {
    await importArchive(userId, fixture());
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId)).limit(1);
    const out = (await buildProjectExport(userId, p!.id))!;
    const exported = readZip(out.bytes);

    await importArchive(userId2, out.bytes);
    const [p2] = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId2)).limit(1);
    const out2 = (await buildProjectExport(userId2, p2!.id))!;
    expect(tex(readZip(out2.bytes))).toEqual(tex(exported));
  });
});