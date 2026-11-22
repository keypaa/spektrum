import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import {
  documents,
  pdfRenders,
  projects,
  users,
} from "@spektrum/db/schema";
import { revisionHash } from "@spektrum/shared/revision";

vi.mock("@spektrum/storage", () => ({
  getObject: vi.fn(async () => ({ body: Buffer.from("pdf"), size: 3 })),
  getObjectRange: vi.fn(async () => ({
    body: new Blob([new Uint8Array(100)]).stream(),
    size: 1234,
  })),
}));

const { getLatestRender, getRender, getRenderLog } = await import(
  "./render-store"
);

const CONTENT = "\\documentclass{article}\\begin{document}Hello\\end{document}\n";
const HASH = revisionHash([{ path: "main.tex", content: CONTENT, blobKey: null }]);

const createdOwners = new Set<string>();

async function makeOwner(email: string): Promise<string> {
  const id = `render-store-${crypto.randomUUID()}`;
  await db.insert(users).values({ id, email, name: "Render Store" });
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

describe("render store", () => {
  it("prefers the current revision's ok render over a newer stale failure", async () => {
    const owner = await makeOwner(`a-${crypto.randomUUID()}@test.local`);
    const projectId = await makeProject(owner);
    await db.insert(documents).values({
      projectId,
      path: "main.tex",
      kind: "tex",
      content: CONTENT,
    });
    await db.insert(pdfRenders).values({
      projectId,
      revisionHash: HASH,
      status: "ok",
      pdfKey: `pdf/${projectId}/${HASH}.pdf`,
      mainFile: "main.tex",
    });
    await db.insert(pdfRenders).values({
      projectId,
      revisionHash: "c".repeat(64),
      status: "error",
      mainFile: "main.tex",
      log: "! LaTeX Error: boom",
    });

    const latest = await getLatestRender(owner, projectId);
    expect(latest?.render.revision).toBe(HASH);
    expect(latest?.render.status).toBe("ok");
    expect(latest?.render.lastOkRevision).toBe(HASH);
    expect(latest?.render.pdfUrl).toBe(
      `/api/projects/${projectId}/render/${HASH}/pdf`,
    );
    expect(latest?.render.isCurrent).toBe(true);
    expect(latest?.render.diagnostics).toEqual([]);
  });

  it("shows the newest stale failure when the documents no longer match it", async () => {
    const owner = await makeOwner(`a-${crypto.randomUUID()}@test.local`);
    const projectId = await makeProject(owner);
    await db.insert(documents).values({
      projectId,
      path: "main.tex",
      kind: "tex",
      content: `${CONTENT}\n% changed\n`,
    });
    await db.insert(pdfRenders).values({
      projectId,
      revisionHash: HASH,
      status: "ok",
      pdfKey: `pdf/${projectId}/${HASH}.pdf`,
      mainFile: "main.tex",
    });
    await db.insert(pdfRenders).values({
      projectId,
      revisionHash: "c".repeat(64),
      status: "error",
      mainFile: "main.tex",
      log: "! LaTeX Error: boom",
    });

    const latest = await getLatestRender(owner, projectId);
    expect(latest?.render.revision).toBe("c".repeat(64));
    expect(latest?.render.lastOkRevision).toBe(HASH);
    expect(latest?.render.pdfUrl).toBe(
      `/api/projects/${projectId}/render/${HASH}/pdf`,
    );
    expect(latest?.render.isCurrent).toBe(false);
    expect(latest?.render.diagnostics).toEqual([]);

    const log = await getRenderLog(owner, projectId, "c".repeat(64));
    expect(log).toContain("boom");
  });

  it("404s another owner's render", async () => {
    const owner = await makeOwner(`a-${crypto.randomUUID()}@test.local`);
    const other = await makeOwner(`b-${crypto.randomUUID()}@test.local`);
    const projectId = await makeProject(owner);
    await db.insert(pdfRenders).values({
      projectId,
      revisionHash: HASH,
      status: "ok",
      pdfKey: `pdf/${projectId}/${HASH}.pdf`,
      mainFile: "main.tex",
    });
    expect(await getRender(other, projectId, HASH)).toBeNull();
  });

  it("marks the current revision when the newest render matches the documents", async () => {
    const owner = await makeOwner(`a-${crypto.randomUUID()}@test.local`);
    const projectId = await makeProject(owner);
    await db.insert(documents).values({
      projectId,
      path: "main.tex",
      kind: "tex",
      content: CONTENT,
    });
    await db.insert(pdfRenders).values({
      projectId,
      revisionHash: HASH,
      status: "ok",
      pdfKey: `pdf/${projectId}/${HASH}.pdf`,
      mainFile: "main.tex",
    });
    const latest = await getLatestRender(owner, projectId);
    expect(latest?.render.isCurrent).toBe(true);
    expect(latest?.render.status).toBe("ok");
  });
});