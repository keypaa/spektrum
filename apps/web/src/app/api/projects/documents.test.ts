import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { projects, users } from "@spektrum/db/schema";
import type { NextRequest } from "next/server";

// Mock only the session lookup; keep the real error classes so errorResponse's
// instanceof checks still work.
const ownerId = `docroute-owner-${crypto.randomUUID()}`;
vi.mock("@/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth/session")>()),
  requireUser: async () => ({ id: ownerId, email: "route@test.local", role: "member" }),
}));

import { GET as getTree } from "./[projectId]/tree/route";
import { GET as getDocuments, POST as postDocuments } from "./[projectId]/documents/route";
import { PATCH as patchDocument, DELETE as deleteDocument } from "./[projectId]/documents/[documentId]/route";
import { POST as postRename } from "./[projectId]/documents/[documentId]/rename/route";
import { GET as getDownload } from "./[projectId]/documents/[documentId]/download/route";

const ORIGIN = "http://localhost:3000";

let projectId = "";

function req(
  method: string,
  url: string,
  body?: unknown,
  origin: string | null = ORIGIN,
): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(url, init) as NextRequest;
}

function ctxProject(project: string) {
  return { params: Promise.resolve({ projectId: project }) };
}

function ctxDoc(project: string, document: string) {
  return { params: Promise.resolve({ projectId: project, documentId: document }) };
}

beforeAll(async () => {
  await db.insert(users).values({
    id: ownerId,
    email: "route@test.local",
    name: "Route Test",
  });
  const [p] = await db
    .insert(projects)
    .values({ ownerId, name: "Route Project" })
    .returning({ id: projects.id });
  projectId = p!.id;
});

afterEach(async () => {
  // Reset the project's documents between tests.
  const { documents } = await import("@spektrum/db/schema");
  await db.delete(documents).where(eq(documents.projectId, projectId));
  await db.update(projects).set({ mainDocumentId: null }).where(eq(projects.id, projectId));
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, ownerId));
  await pool.end();
});

describe("GET /tree", () => {
  it("returns { documents } sorted by path", async () => {
    await postDocuments(req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "b.tex" }), ctxProject(projectId));
    await postDocuments(req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "a.tex" }), ctxProject(projectId));

    const res = await getTree(req("GET", `${ORIGIN}/api/projects/${projectId}/tree`), ctxProject(projectId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents.map((d: { path: string }) => d.path)).toEqual(["a.tex", "b.tex"]);
    expect(body.documents[0]).toMatchObject({ kind: "tex", id: expect.any(String), updatedAt: expect.any(String) });
  });

  it("404s for an unknown project", async () => {
    const res = await getTree(
      req("GET", `${ORIGIN}/api/projects/${crypto.randomUUID()}/tree`),
      ctxProject(crypto.randomUUID()),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});

describe("GET /documents?path=", () => {
  it("returns { document } with content", async () => {
    const created = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "main.tex" }),
      ctxProject(projectId),
    );
    const doc = (await created.json()).document;

    const res = await getDocuments(
      req("GET", `${ORIGIN}/api/projects/${projectId}/documents?path=main.tex`),
      ctxProject(projectId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document.id).toBe(doc.id);
    expect(body.document.path).toBe("main.tex");
    expect(body.document).toHaveProperty("content");
  });

  it("400s without a path param", async () => {
    const res = await getDocuments(
      req("GET", `${ORIGIN}/api/projects/${projectId}/documents`),
      ctxProject(projectId),
    );
    expect(res.status).toBe(400);
  });

  it("404s for an unknown path", async () => {
    const res = await getDocuments(
      req("GET", `${ORIGIN}/api/projects/${projectId}/documents?path=nope.tex`),
      ctxProject(projectId),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});

describe("POST /documents", () => {
  it("creates and returns 201 { document }", async () => {
    const res = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "refs.bib" }),
      ctxProject(projectId),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.document.path).toBe("refs.bib");
    expect(body.document.kind).toBe("bib");
  });

  it("409s on a duplicate path", async () => {
    await postDocuments(req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "main.tex" }), ctxProject(projectId));
    const res = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "main.tex" }),
      ctxProject(projectId),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("duplicate_path");
  });

  it("400s on an invalid path", async () => {
    const res = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "../escape.tex" }),
      ctxProject(projectId),
    );
    expect(res.status).toBe(400);
  });

  it("403s without a matching origin (CSRF)", async () => {
    const res = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "x.tex" }, "https://evil.example"),
      ctxProject(projectId),
    );
    expect(res.status).toBe(403);
  });

  it("403s with no origin header at all", async () => {
    const res = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "x.tex" }, null),
      ctxProject(projectId),
    );
    expect(res.status).toBe(403);
  });
});

describe("PATCH /documents/[documentId]", () => {
  it("saves and returns the §19.2 shape", async () => {
    const created = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "main.tex" }),
      ctxProject(projectId),
    );
    const doc = (await created.json()).document;

    const res = await patchDocument(
      req("PATCH", `${ORIGIN}/api/projects/${projectId}/documents/${doc.id}`, {
        content: "hello world",
        baseUpdatedAt: doc.updatedAt,
      }),
      ctxDoc(projectId, doc.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      documentId: doc.id,
      updatedAt: expect.any(String),
      revisionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("409s with conflict + document on a stale baseline", async () => {
    const created = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "main.tex" }),
      ctxProject(projectId),
    );
    const doc = (await created.json()).document;
    await patchDocument(
      req("PATCH", `${ORIGIN}/api/projects/${projectId}/documents/${doc.id}`, {
        content: "first",
        baseUpdatedAt: doc.updatedAt,
      }),
      ctxDoc(projectId, doc.id),
    );

    const res = await patchDocument(
      req("PATCH", `${ORIGIN}/api/projects/${projectId}/documents/${doc.id}`, {
        content: "second",
        baseUpdatedAt: doc.updatedAt, // stale
      }),
      ctxDoc(projectId, doc.id),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    expect(body.document.content).toBe("first");
  });

  it("400s on a malformed body", async () => {
    const created = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "main.tex" }),
      ctxProject(projectId),
    );
    const doc = (await created.json()).document;
    const res = await patchDocument(
      req("PATCH", `${ORIGIN}/api/projects/${projectId}/documents/${doc.id}`, { content: 42 }),
      ctxDoc(projectId, doc.id),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /documents/[documentId]/rename", () => {
  it("renames and returns the new document", async () => {
    const created = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "old.tex" }),
      ctxProject(projectId),
    );
    const doc = (await created.json()).document;

    const res = await postRename(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents/${doc.id}/rename`, { path: "new.tex" }),
      ctxDoc(projectId, doc.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document.path).toBe("new.tex");
    expect(body.document.id).toBe(doc.id);
  });

  it("409s when the target path exists", async () => {
    const createdA = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "a.tex" }),
      ctxProject(projectId),
    );
    const a = (await createdA.json()).document;
    await postDocuments(req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "b.tex" }), ctxProject(projectId));
    const res = await postRename(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents/${a.id}/rename`, { path: "b.tex" }),
      ctxDoc(projectId, a.id),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("duplicate_path");
  });
});

describe("DELETE /documents/[documentId]", () => {
  it("returns 204 and the tree no longer lists it", async () => {
    const created = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "gone.tex" }),
      ctxProject(projectId),
    );
    const doc = (await created.json()).document;

    const res = await deleteDocument(
      req("DELETE", `${ORIGIN}/api/projects/${projectId}/documents/${doc.id}`),
      ctxDoc(projectId, doc.id),
    );
    expect(res.status).toBe(204);

    const tree = await getTree(req("GET", `${ORIGIN}/api/projects/${projectId}/tree`), ctxProject(projectId));
    expect((await tree.json()).documents).toEqual([]);
  });
});

describe("GET /documents/[documentId]/download", () => {
  it("returns the content as a text/plain attachment", async () => {
    const created = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: "main.tex" }),
      ctxProject(projectId),
    );
    const doc = (await created.json()).document;
    await patchDocument(
      req("PATCH", `${ORIGIN}/api/projects/${projectId}/documents/${doc.id}`, {
        content: "download me",
        baseUpdatedAt: doc.updatedAt,
      }),
      ctxDoc(projectId, doc.id),
    );

    const res = await getDownload(
      req("GET", `${ORIGIN}/api/projects/${projectId}/documents/${doc.id}/download`),
      ctxDoc(projectId, doc.id),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain("main.tex");
    expect(await res.text()).toBe("download me");
  });

  it("strips dangerous characters from the download filename", async () => {
    // A `"` is legal in a document path but must not survive into the header.
    const created = await postDocuments(
      req("POST", `${ORIGIN}/api/projects/${projectId}/documents`, { path: 'ev"il.tex' }),
      ctxProject(projectId),
    );
    expect(created.status).toBe(201);
    const doc = (await created.json()).document;
    const res = await getDownload(
      req("GET", `${ORIGIN}/api/projects/${projectId}/documents/${doc.id}/download`),
      ctxDoc(projectId, doc.id),
    );
    const disposition = res.headers.get("content-disposition") ?? "";
    // The only quotes are the JSON quoting around the filename itself.
    expect(disposition).toBe('attachment; filename="evil.tex"');
    expect(disposition).not.toMatch(/[\r\n]/);
  });
});
