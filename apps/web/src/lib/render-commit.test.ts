// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { pdfRenders, projects, users } from "@spektrum/db/schema";
import { MAX_UPLOAD_BYTES } from "./upload/quotas";
import { scopedKey } from "./upload/scoped-key";
import type { CommitRenderBody, CommitRenderErrorCode } from "./render-commit";

const state = vi.hoisted(() => ({
  objects: new Map<string, { body: Uint8Array; size: number }>(),
  getObjectCalls: [] as Array<{ bucket: string; key: string }>,
}));

vi.mock("@spektrum/storage", async (io) => {
  const actual = await io<typeof import("@spektrum/storage")>();
  return {
    ...actual,
    getObject: async (bucket: string, key: string) => {
      state.getObjectCalls.push({ bucket, key });
      const object = state.objects.get(key);
      if (!object) throw new actual.StorageError("not_found");
      return { body: Buffer.from(object.body), size: object.size };
    },
  };
});

const { commitRender, CommitRenderError } = await import("./render-commit");
const { getLatestRender } = await import("./render-store");

const REVISION = "a".repeat(64);
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function body(userId: string, overrides: Partial<CommitRenderBody> = {}): CommitRenderBody {
  return {
    revision: REVISION,
    mainFile: "main.tex",
    pdfKey: scopedKey(userId, "render", "pdf"),
    synctexKey: null,
    log: "compilation log",
    diagnostics: [],
    stats: null,
    durationMs: 123,
    ...overrides,
  };
}

async function expectFailure(promise: Promise<unknown>, code: CommitRenderErrorCode) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(CommitRenderError);
  expect(error).toMatchObject({ code });
}

const createdUsers = new Set<string>();

beforeEach(() => {
  state.objects.clear();
  state.getObjectCalls = [];
});

afterEach(async () => {
  for (const id of createdUsers) {
    await db.delete(users).where(eq(users.id, id));
  }
  createdUsers.clear();
});

afterAll(async () => {
  await pool.end();
});

async function newOwner(): Promise<string> {
  const id = `render-commit-${crypto.randomUUID()}`;
  await db.insert(users).values({ id, email: `${id}@test.local`, name: "RC" });
  createdUsers.add(id);
  return id;
}

async function makeProject(ownerId: string): Promise<string> {
  const [row] = await db
    .insert(projects)
    .values({ ownerId, name: "P" })
    .returning({ id: projects.id });
  return row!.id;
}

describe("commitRender", () => {
  it("inserts an ok render readable by getLatestRender", async () => {
    const owner = await newOwner();
    const projectId = await makeProject(owner);
    const input = body(owner);
    state.objects.set(input.pdfKey, { body: PDF_BYTES, size: PDF_BYTES.byteLength });

    expect(await commitRender(owner, projectId, input)).toEqual({ revision: REVISION });
    expect(state.getObjectCalls).toEqual([{ bucket: "pdf", key: input.pdfKey }]);

    const latest = await getLatestRender(owner, projectId);
    expect(latest?.render.revision).toBe(REVISION);
    expect(latest?.render.status).toBe("ok");
    expect(latest?.render.mainFile).toBe("main.tex");
    expect(latest?.render.diagnostics).toEqual([]);
    expect(latest?.render.stats).toBeNull();
    expect(latest?.render.durationMs).toBe(123);
    expect(latest?.render.pdfUrl).toBe(
      `/api/projects/${projectId}/render/${REVISION}/pdf`,
    );
  });

  it("updates the existing row instead of duplicating a revision", async () => {
    const owner = await newOwner();
    const projectId = await makeProject(owner);
    const input = body(owner);
    state.objects.set(input.pdfKey, { body: PDF_BYTES, size: PDF_BYTES.byteLength });

    await commitRender(owner, projectId, input);
    await commitRender(owner, projectId, {
      ...input,
      log: "second pass",
      durationMs: 456,
      diagnostics: [{ severity: "warning", message: "overfull", raw: "overfull" }],
    });

    const rows = await db
      .select()
      .from(pdfRenders)
      .where(
        and(
          eq(pdfRenders.projectId, projectId),
          eq(pdfRenders.revisionHash, REVISION),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("ok");
    expect(rows[0]!.log).toBe("second pass");
    expect(rows[0]!.durationMs).toBe(456);
    expect(rows[0]!.diagnostics).toEqual([
      { severity: "warning", message: "overfull", raw: "overfull" },
    ]);

    const latest = await getLatestRender(owner, projectId);
    expect(latest?.render.durationMs).toBe(456);
  });

  it("rejects a non-owner with not_found without writing or reading an object", async () => {
    const owner = await newOwner();
    const other = await newOwner();
    const projectId = await makeProject(owner);
    const input = body(other);
    state.objects.set(input.pdfKey, { body: PDF_BYTES, size: PDF_BYTES.byteLength });

    await expectFailure(commitRender(other, projectId, input), "not_found");
    expect(state.getObjectCalls).toEqual([]);
    expect(
      await db.select().from(pdfRenders).where(eq(pdfRenders.projectId, projectId)),
    ).toEqual([]);
  });

  it("rejects a foreign pdf key with bad_request without reading it", async () => {
    const owner = await newOwner();
    const other = await newOwner();
    const projectId = await makeProject(owner);
    const input = body(owner, { pdfKey: scopedKey(other, "render", "pdf") });
    state.objects.set(input.pdfKey, { body: PDF_BYTES, size: PDF_BYTES.byteLength });

    await expectFailure(commitRender(owner, projectId, input), "bad_request");
    expect(state.getObjectCalls).toEqual([]);
    expect(
      await db.select().from(pdfRenders).where(eq(pdfRenders.projectId, projectId)),
    ).toEqual([]);
  });

  it("rejects an owner-scoped pdf key whose object is missing", async () => {
    const owner = await newOwner();
    const projectId = await makeProject(owner);
    const input = body(owner);

    await expectFailure(commitRender(owner, projectId, input), "bad_request");
    expect(state.getObjectCalls).toEqual([{ bucket: "pdf", key: input.pdfKey }]);
    expect(
      await db.select().from(pdfRenders).where(eq(pdfRenders.projectId, projectId)),
    ).toEqual([]);
  });

  it("rejects an object larger than the render cap before writing", async () => {
    const owner = await newOwner();
    const projectId = await makeProject(owner);
    const input = body(owner);
    state.objects.set(input.pdfKey, {
      body: PDF_BYTES,
      size: MAX_UPLOAD_BYTES.render + 1,
    });

    await expectFailure(commitRender(owner, projectId, input), "too_large");
    expect(
      await db.select().from(pdfRenders).where(eq(pdfRenders.projectId, projectId)),
    ).toEqual([]);
  });

  it("validates the synctex key and object just like the pdf key", async () => {
    const owner = await newOwner();
    const other = await newOwner();
    const projectId = await makeProject(owner);
    const input = body(owner, { synctexKey: scopedKey(other, "render", "synctex") });

    await expectFailure(commitRender(owner, projectId, input), "bad_request");
    expect(state.getObjectCalls).toEqual([]);

    const missing = body(owner, { synctexKey: scopedKey(owner, "render", "synctex") });
    state.objects.set(missing.pdfKey, { body: PDF_BYTES, size: PDF_BYTES.byteLength });
    await expectFailure(commitRender(owner, projectId, missing), "bad_request");
    expect(
      await db.select().from(pdfRenders).where(eq(pdfRenders.projectId, projectId)),
    ).toEqual([]);
  });
});
