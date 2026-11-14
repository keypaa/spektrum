import { afterAll, afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import {
  documents,
  pdfRenders,
  projects,
  users,
} from "@spektrum/db/schema";
import { revisionHash } from "@spektrum/shared/revision";
import { getObject } from "@spektrum/storage";
import { runCompile } from "./compile";

const IT = process.env.RUN_COMPILE_IT === "1";
const BLANK =
  "\\documentclass{article}\n\\begin{document}\nHello world.\n\\end{document}\n";
const BROKEN =
  "\\documentclass{article}\n\\begin{document}\n\\undefinedmacro\n\\end{document}\n";

const createdOwners = new Set<string>();

async function makeOwner(): Promise<string> {
  const id = `worker-compile-${crypto.randomUUID()}`;
  await db
    .insert(users)
    .values({ id, email: `${id}@test.local`, name: "Worker Compile" });
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

describe.skipIf(!IT)("runCompile (integration)", () => {
  it("compiles a clean document and records an ok render", async () => {
    const owner = await makeOwner();
    const projectId = await makeProject(owner);
    await db.insert(documents).values({
      projectId,
      path: "main.tex",
      kind: "tex",
      content: BLANK,
    });
    const revision = revisionHash([
      { path: "main.tex", content: BLANK, blobKey: null },
    ]);

    const result = await runCompile({
      projectId,
      revisionHash: revision,
      mainFile: "main.tex",
    });
    expect(result.status).toBe("ok");
    expect(result.durationMs).toBeGreaterThan(0);

    const rows = await db
      .select()
      .from(pdfRenders)
      .where(
        and(
          eq(pdfRenders.projectId, projectId),
          eq(pdfRenders.revisionHash, revision),
        ),
      );
    expect(rows[0]!.status).toBe("ok");
    expect(rows[0]!.diagnostics).toEqual([]);

    const pdf = await getObject(
      "pdf",
      `pdf/${projectId}/${revision}.pdf`,
    );
    expect(pdf.size).toBeGreaterThan(0);
  });

  it("records an error and its diagnostics for a broken document", async () => {
    const owner = await makeOwner();
    const projectId = await makeProject(owner);
    await db.insert(documents).values({
      projectId,
      path: "main.tex",
      kind: "tex",
      content: BROKEN,
    });
    const revision = revisionHash([
      { path: "main.tex", content: BROKEN, blobKey: null },
    ]);

    const result = await runCompile({
      projectId,
      revisionHash: revision,
      mainFile: "main.tex",
    });
    expect(result.status).toBe("error");

    const rows = await db
      .select()
      .from(pdfRenders)
      .where(
        and(
          eq(pdfRenders.projectId, projectId),
          eq(pdfRenders.revisionHash, revision),
        ),
      );
    expect(rows[0]!.status).toBe("error");
    expect(
      (rows[0]!.diagnostics ?? []).some(
        (d) => d.message.includes("Undefined control sequence") && d.line === 2,
      ),
    ).toBe(true);
  });
});