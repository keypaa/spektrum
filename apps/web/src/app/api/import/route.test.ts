// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const GOOD_KEY = "u/u1/import/00000000-0000-4000-8000-000000000000.zip";
const FOREIGN_KEY = "u/u2/import/11111111-1111-4000-8000-000000000000.zip";
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "u@x", role: "owner" } as null | {
    id: string;
    email: string;
    role: string;
  },
  allowed: true,
  quotaAllowed: true,
  quotaCalls: [] as Array<{ userId: string; bytes: number }>,
  object: null as null | { body: Uint8Array; size: number },
  importCalls: [] as Array<{ userId: string; bytes: Uint8Array }>,
}));

vi.mock("@/auth/session", async (io) => {
  const a = await io<typeof import("@/auth/session")>();
  return {
    ...a,
    requireUser: async () => {
      if (!state.user) throw new a.UnauthorizedError();
      return state.user;
    },
  };
});
vi.mock("@spektrum/shared/rate-limit", () => ({
  BUDGETS: { import: { limit: 10, windowMs: 60_000 } },
  consume: async () => ({ allowed: state.allowed, retryAfterMs: 1000 }),
  getRedis: () => ({ eval: async () => 0 }),
}));
vi.mock("@spektrum/storage", async (io) => {
  const a = await io<typeof import("@spektrum/storage")>();
  return {
    ...a,
    getObject: async () => {
      if (state.object === null) throw new a.StorageError("not_found");
      return { body: Buffer.from(state.object.body), size: state.object.size };
    },
  };
});
vi.mock("@/lib/upload/quotas", async (io) => {
  const a = await io<typeof import("@/lib/upload/quotas")>();
  return {
    ...a,
    consumeStorageQuota: async (userId: string, bytes: number) => {
      state.quotaCalls.push({ userId, bytes });
      return {
        allowed: state.quotaAllowed,
        retryAfterMs: 86_400_000,
      };
    },
  };
});
vi.mock("@/lib/import/import-archive", () => ({
  importArchive: async (userId: string, bytes: Uint8Array) => {
    state.importCalls.push({ userId, bytes });
    return {
      projects: 1,
      files: 1,
      rewrittenPaths: 0,
      promotedMains: 0,
      conversationsImported: 0,
      conversationsSkipped: 0,
      rejectedPaths: [],
      skipped: [],
    };
  },
}));

import { MAX_UPLOAD_BYTES } from "@/lib/upload/quotas";
import { POST } from "./route";

const req = (
  body: unknown = { name: "p.zip", blobKey: GOOD_KEY, contentType: "application/zip" },
  origin = "http://localhost:3000",
) =>
  new Request("http://localhost:3000/api/import", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

beforeEach(() => {
  state.user = { id: "u1", email: "u@x", role: "owner" };
  state.allowed = true;
  state.quotaAllowed = true;
  state.quotaCalls = [];
  state.object = { body: ZIP_MAGIC, size: ZIP_MAGIC.byteLength };
  state.importCalls = [];
});

describe("POST /api/import", () => {
  it("401, 403 cross-origin, 400 without a body, 413 over content-length", async () => {
    state.user = null;
    expect((await POST(req())).status).toBe(401);
    state.user = { id: "u1", email: "u@x", role: "owner" };
    expect((await POST(req(undefined, "http://evil.test"))).status).toBe(403);
    expect((await POST(req(null))).status).toBe(400);
    const big = new Request("http://localhost:3000/api/import", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        "content-length": String(40_000_000),
      },
      body: JSON.stringify({ name: "p.zip", blobKey: GOOD_KEY }),
    }) as never;
    expect((await POST(big)).status).toBe(413);
  });

  it("429 past the budget", async () => {
    state.allowed = false;
    expect((await POST(req())).status).toBe(429);
  });

  it("returns the report for a scoped key and reads the object from R2", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { projects: number } };
    expect(body.report.projects).toBe(1);
    expect(state.importCalls).toEqual([{ userId: "u1", bytes: ZIP_MAGIC }]);
    expect(state.quotaCalls).toEqual([{ userId: "u1", bytes: ZIP_MAGIC.byteLength }]);
  });

  it("400 for a key under another user, without reading the object", async () => {
    const res = await POST(req({ name: "p.zip", blobKey: FOREIGN_KEY }));
    expect(res.status).toBe(400);
    expect(state.object).not.toBeNull();
    expect(state.importCalls).toEqual([]);
    expect(state.quotaCalls).toEqual([]);
  });

  it("400 when the object does not exist", async () => {
    state.object = null;
    expect((await POST(req())).status).toBe(400);
    expect(state.importCalls).toEqual([]);
  });

  it("413 when the object is larger than the import cap", async () => {
    state.object = {
      body: ZIP_MAGIC,
      size: MAX_UPLOAD_BYTES.import + 1,
    };
    const res = await POST(req());
    expect(res.status).toBe(413);
    expect(state.importCalls).toEqual([]);
    expect(state.quotaCalls).toEqual([]);
  });

  it("400 when the object is not a zip archive", async () => {
    state.object = { body: new Uint8Array([1, 2, 3]), size: 3 };
    expect((await POST(req())).status).toBe(400);
    expect(state.importCalls).toEqual([]);
  });

  it("429 with Retry-After when the storage quota is exhausted", async () => {
    state.quotaAllowed = false;
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(state.importCalls).toEqual([]);
  });

  it("400 for a malformed body", async () => {
    expect((await POST(req({ name: "p.zip" }))).status).toBe(400);
    expect((await POST(req({ name: "p.zip", blobKey: "uploads/p.zip" }))).status).toBe(400);
  });
});
