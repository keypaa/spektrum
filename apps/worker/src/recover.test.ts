import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { pdfRenders, projects, users } from "@spektrum/db/schema";
import { recoverStaleLocks, recoverStaleRuns } from "./recover";

const createdOwners = new Set<string>();

async function makeOwner(): Promise<string> {
  const id = `worker-recover-${crypto.randomUUID()}`;
  await db.insert(users).values({
    id,
    email: `${id}@test.local`,
    name: "Worker Recover",
  });
  createdOwners.add(id);
  return id;
}

async function makeProject(ownerId: string): Promise<string> {
  const [row] = await db
    .insert(projects)
    .values({ ownerId, name: "P" })
    .returning({ id: projects.id });
  return row!.id;
}

afterEach(async () => {
  for (const id of createdOwners) {
    await db.delete(users).where(eq(users.id, id));
  }
  createdOwners.clear();
});

afterAll(async () => {
  await pool.end();
});

describe("recoverStaleRuns", () => {
  it("marks an old running row as error and leaves a fresh one", async () => {
    const owner = await makeOwner();
    const projectId = await makeProject(owner);

    const [stale] = await db
      .insert(pdfRenders)
      .values({
        projectId,
        revisionHash: "a".repeat(64),
        status: "running",
        createdAt: new Date(Date.now() - 3 * 60_000),
      })
      .returning({ id: pdfRenders.id });
    const [fresh] = await db
      .insert(pdfRenders)
      .values({
        projectId,
        revisionHash: "b".repeat(64),
        status: "running",
      })
      .returning({ id: pdfRenders.id });

    const recovered = await recoverStaleRuns();
    expect(recovered).toBe(1);

    const staleRow = await db
      .select({ status: pdfRenders.status, log: pdfRenders.log })
      .from(pdfRenders)
      .where(eq(pdfRenders.id, stale!.id));
    expect(staleRow[0]!.status).toBe("error");
    expect(staleRow[0]!.log).toBe("worker restarted");

    const freshRow = await db
      .select({ status: pdfRenders.status })
      .from(pdfRenders)
      .where(eq(pdfRenders.id, fresh!.id));
    expect(freshRow[0]!.status).toBe("running");
  });
});

describe("recoverStaleLocks", () => {
  it("deletes only locks older than two minutes", async () => {
    const store = new Map<string, string>([
      ["compile-lock:a", String(Date.now() - 3 * 60_000)],
      ["compile-lock:b", String(Date.now())],
    ]);
    const fake = {
      scan: async (): Promise<[string, string[]]> => ["0", [...store.keys()]],
      get: async (key: string): Promise<string | null> => store.get(key) ?? null,
      del: async (key: string): Promise<number> => (store.delete(key) ? 1 : 0),
    };

    const removed = await recoverStaleLocks(fake);
    expect(removed).toBe(1);
    expect(store.has("compile-lock:a")).toBe(false);
    expect(store.has("compile-lock:b")).toBe(true);
  });
});