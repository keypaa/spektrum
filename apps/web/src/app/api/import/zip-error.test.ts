// @vitest-environment node
// A corrupt archive is a client error, not an oversize upload: only
// `too_large` may answer 413, otherwise the dialog tells the user their archive
// is too large when it is actually broken.
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "u/u1/import/00000000-0000-4000-8000-000000000000.zip";
const state = vi.hoisted(() => ({
  throwWith: null as null | { code: "too_large" | "too_many" | "ratio" | "bad_zip" },
}));

vi.mock("@/auth/session", async (io) => {
  const a = await io<typeof import("@/auth/session")>();
  return {
    ...a,
    requireUser: async () => ({ id: "u1", email: "u@x", role: "owner" }),
  };
});
vi.mock("@spektrum/shared/rate-limit", () => ({
  BUDGETS: { import: { limit: 10, windowMs: 60_000 } },
  consume: async () => ({ allowed: true, retryAfterMs: 0 }),
  getRedis: () => ({ eval: async () => 0 }),
}));
vi.mock("@spektrum/storage", async (io) => {
  const a = await io<typeof import("@spektrum/storage")>();
  return {
    ...a,
    getObject: async () => ({
      body: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      size: 4,
    }),
  };
});
vi.mock("@/lib/upload/quotas", async (io) => {
  const a = await io<typeof import("@/lib/upload/quotas")>();
  return { ...a, consumeStorageQuota: async () => ({ allowed: true, retryAfterMs: 0 }) };
});
vi.mock("@/lib/import/import-archive", async () => {
  const { ZipError } = await import("@/lib/import/zip");
  return {
    importArchive: async () => {
      if (state.throwWith) throw new ZipError(state.throwWith.code);
      return {
        projects: 0,
        files: 0,
        rewrittenPaths: 0,
        promotedMains: 0,
        conversationsImported: 0,
        conversationsSkipped: 0,
        rejectedPaths: [],
        skipped: [],
      };
    },
  };
});

import { POST } from "./route";

const req = () =>
  new Request("http://localhost:3000/api/import", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ name: "p.zip", blobKey: KEY }),
  }) as never;

beforeEach(() => {
  state.throwWith = null;
});

describe("POST /api/import zip errors", () => {
  it("answers 413 only for a size cap", async () => {
    state.throwWith = { code: "too_large" };
    const res = await POST(req());
    expect(res.status).toBe(413);
    expect((await res.json()) as { error: string }).toEqual({ error: "too_large" });
  });

  it("answers 400 for a corrupt archive", async () => {
    state.throwWith = { code: "bad_zip" };
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({ error: "bad_request" });
  });

  it("answers 400 for too many entries and for a suspicious ratio", async () => {
    state.throwWith = { code: "too_many" };
    expect((await POST(req())).status).toBe(400);
    state.throwWith = { code: "ratio" };
    expect((await POST(req())).status).toBe(400);
  });
});
