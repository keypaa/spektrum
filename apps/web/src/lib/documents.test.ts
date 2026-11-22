import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { documents, projects, users } from "@spektrum/db/schema";

// uploadFiles writes binaries to object storage; these tests only assert the
// database side (inline vs blob), so keep them off the network.
vi.mock("@spektrum/storage", () => ({
  putObject: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
}));

import {
  DocumentPathError,
  ProjectNotFoundError,
  DuplicatePathError,
  StaleDocumentError,
  createDocument,
  deleteDocument,
  getDocumentById,
  getDocumentByPath,
  kindForPath,
  listRevisionDocuments,
  listTree,
  normalizeDocumentPath,
  renameDocument,
  saveDocument,
  seedProjectDocuments,
  uploadFiles,
} from "./documents";
import { revisionHash } from "@spektrum/shared/revision";
import { BLANK_MAIN_TEX, EXAMPLE_MAIN_TEX } from "./templates";

const createdOwners = new Set<string>();

async function makeOwner(): Promise<string> {
  const id = `documents-test-${crypto.randomUUID()}`;
  await db.insert(users).values({
    id,
    email: `${id}@test.local`,
    name: "Documents Test",
  });
  createdOwners.add(id);
  return id;
}

async function makeProject(ownerId: string, name = "P"): Promise<string> {
  const [row] = await db
    .insert(projects)
    .values({ ownerId, name })
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

describe("kindForPath", () => {
  it("maps extensions to kinds", () => {
    expect(kindForPath("main.tex")).toBe("tex");
    expect(kindForPath("main.cls")).toBe("tex");
    expect(kindForPath("main.sty")).toBe("tex");
    expect(kindForPath("refs.bib")).toBe("bib");
    expect(kindForPath("data.csv")).toBe("csv");
    expect(kindForPath("diagram.png")).toBe("img");
    expect(kindForPath("diagram.jpg")).toBe("img");
    expect(kindForPath("notes.txt")).toBe("other");
    expect(kindForPath("Makefile")).toBe("other");
  });

  it("is case-insensitive on the extension", () => {
    expect(kindForPath("MAIN.TEX")).toBe("tex");
    expect(kindForPath("Diagram.PNG")).toBe("img");
  });
});

describe("normalizeDocumentPath", () => {
  it("accepts a plain relative path", () => {
    expect(normalizeDocumentPath("main.tex")).toBe("main.tex");
    expect(normalizeDocumentPath("a/b.tex")).toBe("a/b.tex");
  });

  it("collapses duplicate separators", () => {
    expect(normalizeDocumentPath("a//b.tex")).toBe("a/b.tex");
  });

  it("rejects an empty path", () => {
    expect(() => normalizeDocumentPath("")).toThrow(DocumentPathError);
    expect(() => normalizeDocumentPath("   ")).toThrow(DocumentPathError);
  });

  it("rejects an absolute path", () => {
    expect(() => normalizeDocumentPath("/main.tex")).toThrow(DocumentPathError);
  });

  it("rejects traversal", () => {
    expect(() => normalizeDocumentPath("../x")).toThrow(DocumentPathError);
    expect(() => normalizeDocumentPath("a/../b.tex")).toThrow(DocumentPathError);
  });

  it("rejects a backslash separator", () => {
    expect(() => normalizeDocumentPath("a\\b.tex")).toThrow(DocumentPathError);
  });

  it("rejects a null character", () => {
    expect(() => normalizeDocumentPath("a\u0000b")).toThrow(DocumentPathError);
  });

  it("rejects an over-long name", () => {
    const long = `${"a".repeat(201)}.tex`;
    expect(() => normalizeDocumentPath(long)).toThrow(DocumentPathError);
  });
});

describe("uploadFiles", () => {
  it("keeps each upload's own name, stores text inline and skips duplicate paths", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const bytes = new TextEncoder().encode("hello\n");

    const first = await uploadFiles(ownerId, projectId, [
      { name: "paper.tex", bytes },
      { name: "../paper.tex", bytes },
    ]);
    expect(first.documents).toHaveLength(1);
    expect(first.documents[0]!.path).toBe("paper.tex");
    expect(first.skipped).toEqual(["../paper.tex"]);

    const stored = await getDocumentById(ownerId, projectId, first.documents[0]!.id);
    expect(stored?.content).toBe("hello\n");
    expect(stored?.blobKey).toBeNull();

    const second = await uploadFiles(ownerId, projectId, [
      { name: "paper.tex", bytes },
    ]);
    expect(second.documents).toHaveLength(0);
    expect(second.skipped).toEqual(["paper.tex"]);
  });

  it("stores a PDF as a blob even when its bytes decode as UTF-8", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    // ASCII-only PDF bytes are valid UTF-8; they must still not become an
    // editable inline document.
    const bytes = new TextEncoder().encode(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
    );

    const result = await uploadFiles(ownerId, projectId, [
      { name: "scan.pdf", bytes },
    ]);
    const stored = await getDocumentById(
      ownerId,
      projectId,
      result.documents[0]!.id,
    );
    expect(stored?.content).toBeNull();
    expect(stored?.blobKey).toBe(`${projectId}/scan.pdf`);
  });
});

describe("seedProjectDocuments", () => {
  it("inserts main.tex with the blank template", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);

    const id = await seedProjectDocuments(projectId);

    const doc = await getDocumentById(ownerId, projectId, id);
    expect(doc?.path).toBe("main.tex");
    expect(doc?.kind).toBe("tex");
    expect(doc?.content).toBe(BLANK_MAIN_TEX);
  });

  it("inserts the example template when asked", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);

    const id = await seedProjectDocuments(projectId, "example");

    const doc = await getDocumentById(ownerId, projectId, id);
    expect(doc?.content).toBe(EXAMPLE_MAIN_TEX);
  });
});

describe("createDocument / listTree / getDocumentByPath", () => {
  it("creates a document and lists it sorted by path", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);

    await createDocument(ownerId, projectId, "b.tex");
    await createDocument(ownerId, projectId, "a.tex");
    await createDocument(ownerId, projectId, "c.tex");

    const tree = await listTree(ownerId, projectId);
    expect(tree.map((d) => d.path)).toEqual(["a.tex", "b.tex", "c.tex"]);
  });

  it("rejects a duplicate path", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    await createDocument(ownerId, projectId, "main.tex");

    await expect(createDocument(ownerId, projectId, "main.tex")).rejects.toThrow(
      DuplicatePathError,
    );
  });

  it("infers the kind from the extension", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);

    const doc = await createDocument(ownerId, projectId, "refs.bib");
    expect(doc.kind).toBe("bib");
  });

  it("returns a new document with null content", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);

    const doc = await createDocument(ownerId, projectId, "new.tex");
    expect(doc.content).toBeNull();
    expect(doc.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("finds a document by path and by id", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const created = await createDocument(ownerId, projectId, "main.tex");

    const byPath = await getDocumentByPath(ownerId, projectId, "main.tex");
    expect(byPath?.id).toBe(created.id);
    expect(byPath).toHaveProperty("blobKey");
    expect((await getDocumentById(ownerId, projectId, created.id))?.path).toBe(
      "main.tex",
    );
  });

  it("finds a legacy NFD path through its NFC form", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const nfd = "Cours 3 - Anthropoce\u0300ne.pdf";
    const nfc = nfd.normalize("NFC");

    // Rows imported before paths were canonicalised can still hold NFD.
    await db.insert(documents).values({
      projectId,
      path: nfd,
      kind: "img",
      content: null,
      blobKey: `${projectId}/${nfd}`,
    });

    const found = await getDocumentByPath(ownerId, projectId, nfc);
    expect(found?.path).toBe(nfd);
  });

  it("returns null for an unknown path or id", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);

    expect(await getDocumentByPath(ownerId, projectId, "nope.tex")).toBeNull();
    expect(
      await getDocumentById(ownerId, projectId, crypto.randomUUID()),
    ).toBeNull();
  });
});

describe("saveDocument", () => {
  it("saves content and returns the revision hash", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const doc = await createDocument(ownerId, projectId, "main.tex");

    const result = await saveDocument(
      ownerId,
      projectId,
      doc.id,
      "hello",
      doc.updatedAt,
    );

    expect(result.documentId).toBe(doc.id);
    expect(result.revisionHash).toMatch(/^[0-9a-f]{64}$/);

    const reloaded = await getDocumentById(ownerId, projectId, doc.id);
    expect(reloaded?.content).toBe("hello");
    expect(reloaded?.updatedAt).toBe(result.updatedAt);
  });

  it("rejects a stale baseUpdatedAt with the current document", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const doc = await createDocument(ownerId, projectId, "main.tex");

    await saveDocument(ownerId, projectId, doc.id, "first", doc.updatedAt);

    let thrown: unknown;
    try {
      await saveDocument(ownerId, projectId, doc.id, "second", doc.updatedAt);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(StaleDocumentError);
    expect((thrown as StaleDocumentError).current.content).toBe("first");
  });

  it("accepts the updatedAt returned by the previous save", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const doc = await createDocument(ownerId, projectId, "main.tex");

    const first = await saveDocument(ownerId, projectId, doc.id, "one", doc.updatedAt);
    const second = await saveDocument(
      ownerId,
      projectId,
      doc.id,
      "two",
      first.updatedAt,
    );
    const reloaded = await getDocumentById(ownerId, projectId, doc.id);
    expect(reloaded?.content).toBe("two");
    expect(reloaded?.updatedAt).toBe(second.updatedAt);
  });

  it("returns the same revision hash for unchanged content", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const id = await seedProjectDocuments(projectId);

    const docs = await listRevisionDocuments(projectId);
    expect(revisionHash(docs)).toBe(revisionHash(docs));

    const first = await saveDocument(
      ownerId,
      projectId,
      id,
      BLANK_MAIN_TEX,
      (await getDocumentById(ownerId, projectId, id))!.updatedAt,
    );
    const second = await saveDocument(
      ownerId,
      projectId,
      id,
      BLANK_MAIN_TEX,
      first.updatedAt,
    );
    expect(second.revisionHash).toBe(first.revisionHash);
  });
});

describe("renameDocument", () => {
  it("keeps the id and content and changes the path", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const doc = await createDocument(ownerId, projectId, "old.tex");
    await saveDocument(ownerId, projectId, doc.id, "body", doc.updatedAt);

    const renamed = await renameDocument(ownerId, projectId, doc.id, "new.tex");

    expect(renamed.id).toBe(doc.id);
    expect(renamed.path).toBe("new.tex");
    expect(renamed.content).toBe("body");
    expect(await getDocumentByPath(ownerId, projectId, "old.tex")).toBeNull();
  });

  it("rejects a collision", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const a = await createDocument(ownerId, projectId, "a.tex");
    await createDocument(ownerId, projectId, "b.tex");

    await expect(renameDocument(ownerId, projectId, a.id, "b.tex")).rejects.toThrow(
      DuplicatePathError,
    );
  });
});

describe("deleteDocument", () => {
  it("removes the row", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const doc = await createDocument(ownerId, projectId, "main.tex");

    await deleteDocument(ownerId, projectId, doc.id);

    expect(await getDocumentById(ownerId, projectId, doc.id)).toBeNull();
    expect(await listTree(ownerId, projectId)).toEqual([]);
  });

  it("reassigns main_document_id when the main document goes", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const main = await createDocument(ownerId, projectId, "main.tex");
    const other = await createDocument(ownerId, projectId, "other.tex");
    await db
      .update(projects)
      .set({ mainDocumentId: main.id })
      .where(eq(projects.id, projectId));

    await deleteDocument(ownerId, projectId, main.id);

    const [row] = await db
      .select({ mainDocumentId: projects.mainDocumentId })
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(row?.mainDocumentId).toBe(other.id);
  });

  it("clears main_document_id when no .tex remains", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const main = await createDocument(ownerId, projectId, "main.tex");
    await db
      .update(projects)
      .set({ mainDocumentId: main.id })
      .where(eq(projects.id, projectId));

    await deleteDocument(ownerId, projectId, main.id);

    const [row] = await db
      .select({ mainDocumentId: projects.mainDocumentId })
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(row?.mainDocumentId ?? null).toBeNull();
  });
});

describe("ownership", () => {
  it("never returns another owner's documents", async () => {
    const ownerId = await makeOwner();
    const otherId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const doc = await createDocument(ownerId, projectId, "main.tex");

    await expect(listTree(otherId, projectId)).rejects.toThrow(
      ProjectNotFoundError,
    );
    expect(await getDocumentById(otherId, projectId, doc.id)).toBeNull();
    expect(await getDocumentByPath(otherId, projectId, "main.tex")).toBeNull();
  });

  it("refuses a mutation on another owner's project", async () => {
    const ownerId = await makeOwner();
    const otherId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const doc = await createDocument(ownerId, projectId, "main.tex");

    await expect(
      saveDocument(otherId, projectId, doc.id, "x", doc.updatedAt),
    ).rejects.toThrow(ProjectNotFoundError);
    await expect(
      renameDocument(otherId, projectId, doc.id, "y.tex"),
    ).rejects.toThrow();
    await expect(deleteDocument(otherId, projectId, doc.id)).rejects.toThrow();

    // The document must be untouched — the owner still sees the original.
    const after = await getDocumentById(ownerId, projectId, doc.id);
    expect(after?.path).toBe("main.tex");
    expect(after?.content).toBeNull();
  });

  it("does not let save write through a project the caller does not own", async () => {
    const ownerId = await makeOwner();
    const otherId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const doc = await createDocument(ownerId, projectId, "main.tex");

    // A well-formed request for someone else's document must not write, even
    // though `documentId` and `projectId` both exist and the baseline matches.
    await expect(
      saveDocument(otherId, projectId, doc.id, "injected", doc.updatedAt),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);

    const after = await getDocumentById(ownerId, projectId, doc.id);
    expect(after?.content).toBeNull();
  });

  it("ignores a soft-deleted project", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    const doc = await createDocument(ownerId, projectId, "main.tex");
    await db
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(eq(projects.id, projectId));

    await expect(listTree(ownerId, projectId)).rejects.toThrow(
      ProjectNotFoundError,
    );
    expect(await getDocumentById(ownerId, projectId, doc.id)).toBeNull();
  });
});

describe("listRevisionDocuments", () => {
  it("returns every document of the project with its content", async () => {
    const ownerId = await makeOwner();
    const projectId = await makeProject(ownerId);
    await createDocument(ownerId, projectId, "main.tex");
    await createDocument(ownerId, projectId, "refs.bib");

    const docs = await listRevisionDocuments(projectId);
    expect(docs.map((d) => d.path).sort()).toEqual(["main.tex", "refs.bib"]);
    expect(docs.find((d) => d.path === "main.tex")?.content).toBeNull();
  });

  it("does not leak another project's documents", async () => {
    const ownerId = await makeOwner();
    const a = await makeProject(ownerId, "A");
    const b = await makeProject(ownerId, "B");
    await createDocument(ownerId, a, "a.tex");

    const docs = await listRevisionDocuments(b);
    expect(docs).toEqual([]);
  });
});