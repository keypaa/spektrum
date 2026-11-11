import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { folders, projects, users } from "@spektrum/db/schema";
import {
  createFolder,
  createProject,
  duplicateProject,
  listProjects,
  projectName,
  renameProject,
  softDeleteProject,
} from "./projects";

const HOUR = 60 * 60 * 1000;
const createdOwners = new Set<string>();

async function makeOwner(): Promise<string> {
  const id = `projects-test-${crypto.randomUUID()}`;
  await db.insert(users).values({
    id,
    email: `${id}@test.local`,
    name: "Projects Test",
  });
  createdOwners.add(id);
  return id;
}

async function insertProject(
  ownerId: string,
  name: string,
  createdAt: Date,
): Promise<string> {
  const [row] = await db
    .insert(projects)
    .values({ ownerId, name, createdAt })
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

describe("listProjects", () => {
  it("returns only the owner's active projects, newest first", async () => {
    const ownerId = await makeOwner();
    const otherId = await makeOwner();
    const base = new Date("2026-01-01T00:00:00Z");

    const older = await insertProject(ownerId, "older", base);
    const newer = await insertProject(ownerId, "newer", new Date(base.getTime() + HOUR));
    const deleted = await insertProject(
      ownerId,
      "deleted",
      new Date(base.getTime() + 2 * HOUR),
    );
    await insertProject(otherId, "someone else's", new Date(base.getTime() + 3 * HOUR));
    await softDeleteProject(ownerId, deleted);

    const rows = await listProjects(ownerId);

    expect(rows.map((row) => row.name)).toEqual(["newer", "older"]);
    expect(rows.map((row) => row.id)).toEqual([newer, older]);
    expect(rows[0]!.folderId).toBeNull();
    expect(rows[0]!.createdAt).toBeInstanceOf(Date);
  });
});

describe("createProject", () => {
  it("inserts an active project owned by the caller", async () => {
    const ownerId = await makeOwner();

    const created = await createProject(ownerId, "New Project");

    expect(created.name).toBe("New Project");
    expect(created.folderId).toBeNull();
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, created.id));
    expect(row!.ownerId).toBe(ownerId);
    expect(row!.deletedAt).toBeNull();
  });
});

describe("duplicateProject", () => {
  it("copies the owner and leaves the source untouched", async () => {
    const ownerId = await makeOwner();
    const sourceId = await insertProject(
      ownerId,
      "PRJ - LINEAR ALGEBRA - V1",
      new Date("2026-01-01T00:00:00Z"),
    );

    const copy = await duplicateProject(ownerId, sourceId, "Copy of PRJ - LINEAR ALGEBRA - V1");

    expect(copy.name).toBe("Copy of PRJ - LINEAR ALGEBRA - V1");
    const [copyRow] = await db.select().from(projects).where(eq(projects.id, copy.id));
    const [sourceRow] = await db.select().from(projects).where(eq(projects.id, sourceId));
    expect(copyRow!.ownerId).toBe(ownerId);
    expect(sourceRow!.ownerId).toBe(ownerId);
    expect(sourceRow!.name).toBe("PRJ - LINEAR ALGEBRA - V1");
    expect(sourceRow!.deletedAt).toBeNull();
  });

  it("refuses to duplicate another owner's project", async () => {
    const ownerId = await makeOwner();
    const otherId = await makeOwner();
    const sourceId = await insertProject(otherId, "not yours", new Date());

    await expect(duplicateProject(ownerId, sourceId, "stolen")).rejects.toThrow(
      "project not found",
    );
  });
});

describe("softDeleteProject", () => {
  it("sets deletedAt and removes the row from listProjects", async () => {
    const ownerId = await makeOwner();
    const id = await insertProject(ownerId, "doomed", new Date());

    await softDeleteProject(ownerId, id);

    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    expect(row!.deletedAt).toBeInstanceOf(Date);
    expect(await listProjects(ownerId)).toEqual([]);
  });
});

describe("cross-tenant guards", () => {
  it("does not rename a project owned by someone else", async () => {
    const ownerId = await makeOwner();
    const otherId = await makeOwner();
    const id = await insertProject(otherId, "victim", new Date());

    await renameProject(ownerId, id, "hacked");

    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    expect(row!.name).toBe("victim");
  });

  it("does not delete a project owned by someone else", async () => {
    const ownerId = await makeOwner();
    const otherId = await makeOwner();
    const id = await insertProject(otherId, "victim", new Date());

    await softDeleteProject(ownerId, id);

    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    expect(row!.deletedAt).toBeNull();
  });
});

describe("createFolder and projectName", () => {
  it("creates a folder scoped to the owner", async () => {
    const ownerId = await makeOwner();

    const id = await createFolder(ownerId, "Folder");

    const [row] = await db.select().from(folders).where(eq(folders.id, id));
    expect(row!.ownerId).toBe(ownerId);
    expect(row!.name).toBe("Folder");
  });

  it("resolves names only within the owner scope and falls back to New Project", async () => {
    const ownerId = await makeOwner();
    const otherId = await makeOwner();
    const id = await insertProject(ownerId, "Named", new Date());

    expect(await projectName(ownerId, id)).toBe("Named");
    expect(await projectName(otherId, id)).toBe("New Project");
    expect(await projectName(ownerId, crypto.randomUUID())).toBe("New Project");
  });
});
