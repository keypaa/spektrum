import { afterAll, afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "./client";
import { documents, projects, snapshots, users } from "./schema";
import {
  listSnapshots,
  pruneSnapshots,
  restoreSnapshot,
  restoreSnapshots,
  snapshotAfterCompile,
} from "./snapshots";

const createdOwners = new Set<string>();

async function makeOwner(): Promise<string> {
  const id = `snapshots-test-${crypto.randomUUID()}`;
  await db
    .insert(users)
    .values({ id, email: `${id}@test.local`, name: "Snapshots" });
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

describe("snapshots", () => {
  it("snapshots changed text documents once, then only on change", async () => {
    const owner = await makeOwner();
    const projectId = await makeProject(owner);
    await db.insert(documents).values({
      projectId,
      path: "main.tex",
      kind: "tex",
      content: "A",
    });

    expect(await snapshotAfterCompile(projectId, owner)).toBe(1);
    expect(await snapshotAfterCompile(projectId, owner)).toBe(0);

    await db
      .update(documents)
      .set({ content: "B" })
      .where(and(eq(documents.projectId, projectId), eq(documents.path, "main.tex")));
    expect(await snapshotAfterCompile(projectId, owner)).toBe(1);

    const rows = await listSnapshots(owner, projectId);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.author).toBe("Snapshots");
  });

  it("prunes to the newest 50 rows", async () => {
    const owner = await makeOwner();
    const projectId = await makeProject(owner);
    const [document] = await db
      .insert(documents)
      .values({ projectId, path: "main.tex", kind: "tex", content: "A" })
      .returning({ id: documents.id });
    for (let index = 0; index < 60; index += 1) {
      await db.insert(snapshots).values({
        projectId,
        documentId: document!.id,
        content: `c${index}`,
        authorId: owner,
      });
    }
    expect(await pruneSnapshots(projectId)).toBe(10);
    const rows = await db
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(eq(snapshots.projectId, projectId));
    expect(rows).toHaveLength(50);
  });

  it("restores a batch and 404s another owner's snapshot", async () => {
    const owner = await makeOwner();
    const other = await makeOwner();
    const projectId = await makeProject(owner);
    await db.insert(documents).values({
      projectId,
      path: "main.tex",
      kind: "tex",
      content: "A",
    });
    await snapshotAfterCompile(projectId, owner);

    await db
      .update(documents)
      .set({ content: "B" })
      .where(and(eq(documents.projectId, projectId), eq(documents.path, "main.tex")));

    const rows = await listSnapshots(owner, projectId);
    const batchId = rows[0]!.batchId!;
    expect(await restoreSnapshots(owner, projectId, batchId)).toBe(1);
    const restored = await db
      .select({ content: documents.content })
      .from(documents)
      .where(and(eq(documents.projectId, projectId), eq(documents.path, "main.tex")));
    expect(restored[0]!.content).toBe("A");

    expect(await restoreSnapshot(other, projectId, rows[0]!.id)).toBeNull();
  });
});