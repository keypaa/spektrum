import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { listRevisionDocuments } from "@spektrum/db/documents";
import {
  documents,
  pdfRenders,
  projects,
  users,
} from "@spektrum/db/schema";
import { revisionHash } from "@spektrum/shared/revision";
import type { Diagnostic } from "@spektrum/shared/compile";
import { compileAndWait, executeTool } from "./tools";
import { extractPdfText } from "./pdf-text";

const state = vi.hoisted(() => ({
  enqueued: { kind: "enqueued", revision: "r" } as
    | { kind: "enqueued"; revision: string }
    | { kind: "cached"; revision: string }
    | { kind: "rate_limited"; retryAfterMs: number }
    | { kind: "not_found" },
  waited: {
    status: "ok",
    diagnostics: [] as Diagnostic[],
  } as { status: "ok" | "error" | "superseded" | "timeout"; diagnostics: Diagnostic[] },
}));

vi.mock("@/lib/compile-request", () => ({
  enqueueProjectCompile: vi.fn(async () => state.enqueued),
}));

vi.mock("./pdf-text", () => ({
  extractPdfText: vi.fn(async () => ({
    text: "pdf text",
    pages: 1,
    truncated: false,
  })),
}));

const run = Math.random().toString(36).slice(2, 10);
const userId = `tools-${run}`;
const otherId = `tools-other-${run}`;
const projectId = crypto.randomUUID();
const waitProjectId = crypto.randomUUID();
const waitRevision = "b".repeat(64);

const diagnostics: Diagnostic[] = Array.from({ length: 11 }, (_, i) => ({
  severity: "error" as const,
  message: `diag-${i}`,
  file: "main.tex",
  line: i,
  raw: `raw-${i}`,
}));

let revision = "";

const ctx = () => ({
  userId,
  role: "member",
  projectId,
  mainFile: "main.tex",
  touchedPaths: new Set<string>(),
});

beforeAll(async () => {
  await db.insert(users).values([
    { id: userId, email: `tools-${run}@test.local`, name: "T" },
    { id: otherId, email: `tools-other-${run}@test.local`, name: "O" },
  ]);
  await db.insert(projects).values([
    { id: projectId, ownerId: userId, name: "Tools" },
    { id: waitProjectId, ownerId: userId, name: "Wait" },
  ]);
  await db.insert(documents).values([
    { projectId, path: "main.tex", kind: "tex", content: "a\nb\nc\n" },
    { projectId, path: "refs.bib", kind: "bib", content: "@article{k,\n title={T}\n}\n" },
    { projectId, path: "a.tex", kind: "tex", content: "alpha\n" },
    { projectId, path: "image.png", kind: "img", blobKey: "blob/image.png", content: null },
  ]);
  revision = revisionHash(await listRevisionDocuments(projectId));
  await db.insert(pdfRenders).values([
    {
      projectId,
      revisionHash: revision,
      mainFile: "main.tex",
      status: "error",
      diagnostics,
      log: "log",
    },
    {
      projectId: waitProjectId,
      revisionHash: waitRevision,
      status: "ok",
      diagnostics: [],
      log: "",
    },
  ]);
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, otherId));
  await pool.end();
});

describe("read_pdf", () => {
  it("returns a non-fatal result when extraction fails", async () => {
    vi.mocked(extractPdfText).mockRejectedValueOnce(new Error("bad pdf"));
    const result = await executeTool("read_pdf", { path: "brief.pdf" }, ctx());
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fatal).toBe(false);
    expect(result.summary).toContain("could not extract brief.pdf");
  });

  it("extracts text and touches the path", async () => {
    const context = ctx();
    const result = await executeTool(
      "read_pdf",
      { path: "brief.pdf", pages: [1, 2] },
      context,
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toBe("pdf text");
    expect(context.touchedPaths.has("brief.pdf")).toBe(true);
    expect(extractPdfText).toHaveBeenCalledWith(
      userId,
      projectId,
      "brief.pdf",
      [1, 2],
    );
  });
});

describe("executeTool read-only tools", () => {
  it("lists every file with kind and bytes", async () => {
    const result = await executeTool("list_files", {}, ctx());
    expect(result.ok).toBe(true);
    const files = ((result as { data?: { files: Array<{ path: string; kind: string; bytes: number | null }> } }).data!).files;
    expect(files.map((f) => f.path)).toContain("main.tex");
    expect(files.find((f) => f.path === "image.png")?.bytes).toBeNull();
    expect(files.find((f) => f.path === "main.tex")?.bytes).toBe(6);
  });

  it("reads a file and a line range, and rejects blobs/traversal", async () => {
    const all = await executeTool("read_file", { path: "main.tex" }, ctx());
    expect((all as { data?: string }).data).toContain("a\nb\nc");
    const range = await executeTool(
      "read_file",
      { path: "main.tex", startLine: 2, endLine: 3 },
      ctx(),
    );
    expect((range as { data?: string }).data).toBe("b\nc");
    const blob = await executeTool("read_file", { path: "image.png" }, ctx());
    expect(blob).toMatchObject({ ok: false, summary: "binary document" });
    const escape = await executeTool("read_file", { path: "../x" }, ctx());
    expect(escape.ok).toBe(false);
  });

  it("searches text documents and returns whole lines", async () => {
    const result = await executeTool("search_project", { query: "b" }, ctx());
    expect(result.ok).toBe(true);
    const hits = (result as { data?: Array<{ path: string; line: number; text: string }> }).data!;
    expect(hits[0]).toMatchObject({ path: "main.tex", line: 2, text: "b" });
  });

  it("returns the last ten diagnostics", async () => {
    const result = await executeTool("get_logs", {}, ctx());
    const logs = (result as { data?: Diagnostic[] }).data!;
    expect(logs).toHaveLength(10);
    expect(logs[9]?.message).toBe("diag-10");
  });
});

describe("executeTool proposal tools", () => {
  it("proposes an edit without changing the DB", async () => {
    const result = await executeTool(
      "edit_file",
      { path: "main.tex", oldText: "b", newText: "B", reason: "fix" },
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect((result as { proposal?: { proposedContent?: string } }).proposal?.proposedContent).toBe("a\nB\nc\n");
    const row = await db.select({ content: documents.content }).from(documents).where(eq(documents.path, "main.tex"));
    expect(row[0]?.content).toBe("a\nb\nc\n");
  });

  it("rejects another owner's project", async () => {
    const result = await executeTool(
      "write_file",
      { path: "main.tex", content: "x", reason: "x" },
      { ...ctx(), userId: otherId },
    );
    expect(result.ok).toBe(false);
  });

  it("marks an unknown tool fatal and a missing file non-fatal", async () => {
    const unknown = await executeTool("bogus" as never, {}, ctx());
    expect(unknown).toMatchObject({ ok: false, fatal: true });
    const missing = await executeTool("read_file", { path: "missing.tex" }, ctx());
    expect(missing).toMatchObject({ ok: false, fatal: false });
  });
});

describe("compile tool", () => {
  it("enqueues and waits for the revision", async () => {
    state.enqueued = { kind: "enqueued", revision };
    state.waited = { status: "ok", diagnostics: [] };
    const result = await executeTool("compile", {}, ctx());
    expect(result.ok).toBe(true);
    expect((result as { data?: unknown }).data).toBeDefined();
  });

  it("turns a 429 into a non-fatal tool error", async () => {
    state.enqueued = { kind: "rate_limited", retryAfterMs: 1000 };
    const result = await executeTool("compile", {}, ctx());
    expect(result).toMatchObject({ ok: false, fatal: false });
  });
});

describe("compileAndWait", () => {
  it("returns a superseded row immediately", async () => {
    await db
      .update(pdfRenders)
      .set({ status: "superseded" })
      .where(eq(pdfRenders.projectId, waitProjectId));
    const result = await compileAndWait(waitProjectId, waitRevision);
    expect(result.status).toBe("superseded");
  });

  it("waits for a queued row to become ok", async () => {
    await db
      .update(pdfRenders)
      .set({ status: "queued", diagnostics: [] })
      .where(eq(pdfRenders.projectId, waitProjectId));
    const pending = compileAndWait(waitProjectId, waitRevision, undefined, {
      timeoutMs: 3000,
      intervalMs: 25,
    });
    await db
      .update(pdfRenders)
      .set({ status: "ok", diagnostics: [] })
      .where(eq(pdfRenders.projectId, waitProjectId));
    const result = await pending;
    expect(result.status).toBe("ok");
  });

  it("times out a row stuck in running", async () => {
    await db
      .update(pdfRenders)
      .set({ status: "running" })
      .where(eq(pdfRenders.projectId, waitProjectId));
    const result = await compileAndWait(waitProjectId, waitRevision, undefined, {
      timeoutMs: 100,
      intervalMs: 20,
    });
    expect(result.status).toBe("timeout");
  });
});