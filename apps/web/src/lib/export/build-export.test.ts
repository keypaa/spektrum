// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { documents, projects, users } from "@spektrum/db/schema";
import { buildProjectExport } from "./build-export";
import { readZip } from "../import/zip";

const run = Math.random().toString(36).slice(2, 10);
const userId = `exp-${run}`;
let projectId = "";
beforeAll(async () => {
  await db.insert(users).values({ id: userId, email: `exp-${run}@test.local`, name: "E" });
  const [p] = await db.insert(projects).values({ ownerId: userId, name: "Exp Project" }).returning({ id: projects.id });
  projectId = p!.id;
  await db.insert(documents).values([
    { projectId, path: "main.tex", kind: "tex", content: "\\documentclass{article}\n" },
    { projectId, path: "refs.bib", kind: "bib", content: "@article{k}\n" },
  ]);
});
afterAll(async () => { await db.delete(users).where(eq(users.id, userId)); await pool.end(); });

describe("buildProjectExport", () => {
  it("zips the user files plus spektrum-export.json", async () => {
    const out = (await buildProjectExport(userId, projectId))!;
    expect(out.fileName).toBe("Exp Project.zip");
    const paths = readZip(out.bytes).map((e) => e.path);
    expect(paths).toContain("Exp Project/main.tex");
    expect(paths).toContain("Exp Project/spektrum-export.json");
  });

  it("returns null for another owner", async () => {
    expect(await buildProjectExport("nobody", projectId)).toBeNull();
  });
});