// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "00000000-0000-4000-8000-000000000000";
const OWNER_A = "u/u1/workspace/11111111-1111-4000-8000-000000000000.pdf";
const OWNER_B = "u/u1/workspace/22222222-2222-4000-8000-000000000000.tex";
const FOREIGN = "u/u2/workspace/33333333-3333-4000-8000-000000000000.png";

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "u@x", role: "owner" } as null | {
    id: string;
    email: string;
    role: string;
  },
  allowed: true,
  quotaAllowed: true,
  quotaCalls: [] as Array<{ userId: string; bytes: number }>,
  objects: new Map<string, { body: Uint8Array; size: number }>(),
  uploadCalls: [] as Array<{
    ownerId: string;
    projectId: string;
    files: Array<{ name: string; bytes: Uint8Array; contentType?: string }>;
  }>,
  missingProject: false,
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
  BUDGETS: { upload: { limit: 10, windowMs: 60_000 } },
  consume: async () => ({ allowed: state.allowed, retryAfterMs: 1000 }),
  getRedis: () => ({ eval: async () => 0 }),
}));
vi.mock("@spektrum/storage", async (io) => {
  const a = await io<typeof import("@spektrum/storage")>();
  return {
    ...a,
    getObject: async (_bucket: string, key: string) => {
      const object = state.objects.get(key);
      if (!object) throw new a.StorageError("not_found");
      return { body: Buffer.from(object.body), size: object.size };
    },
  };
});
vi.mock("@/lib/upload/quotas", async (io) => {
  const a = await io<typeof import("@/lib/upload/quotas")>();
  return {
    ...a,
    consumeStorageQuota: async (userId: string, bytes: number) => {
      state.quotaCalls.push({ userId, bytes });
      return { allowed: state.quotaAllowed, retryAfterMs: 86_400_000 };
    },
  };
});
vi.mock("@/lib/documents", async (io) => {
  const a = await io<typeof import("@/lib/documents")>();
  return {
    ...a,
    uploadFiles: async (
      ownerId: string,
      projectId: string,
      files: Array<{ name: string; bytes: Uint8Array; contentType?: string }>,
    ) => {
      if (state.missingProject) throw new a.ProjectNotFoundError();
      state.uploadCalls.push({ ownerId, projectId, files });
      return {
        documents: files.map((file, i) => ({
          id: `doc-${i}`,
          path: file.name,
          kind: "other" as const,
          updatedAt: "2026-01-01T00:00:00.000Z",
        })),
        skipped: [],
      };
    },
  };
});

import { POST as signPOST } from "@/app/api/uploads/sign/route";
import { MAX_UPLOAD_BYTES } from "@/lib/upload/quotas";
import { assertScopedKey } from "@/lib/upload/scoped-key";
import { POST } from "./route";

const req = (
  body: unknown = {
    files: [
      { name: "paper.pdf", blobKey: OWNER_A, contentType: "application/pdf" },
      { name: "notes.tex", blobKey: OWNER_B, contentType: "text/plain" },
    ],
  },
  origin = "http://localhost:3000",
  projectId = PROJECT_ID,
) =>
  new Request(`http://localhost:3000/api/projects/${projectId}/upload`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

const ctx = (projectId = PROJECT_ID) =>
  ({ params: Promise.resolve({ projectId }) }) as never;

beforeEach(() => {
  state.user = { id: "u1", email: "u@x", role: "owner" };
  state.allowed = true;
  state.quotaAllowed = true;
  state.quotaCalls = [];
  state.objects = new Map([
    [OWNER_A, { body: new Uint8Array([0x25, 0x50, 0x44, 0x46]), size: 4 }],
    [OWNER_B, { body: new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]), size: 5 }],
  ]);
  state.uploadCalls = [];
  state.missingProject = false;
});

describe("POST /api/projects/:projectId/upload", () => {
  it("401, 403 cross-origin, 404 for a bad project id, 400 for no body, 413 over content-length", async () => {
    state.user = null;
    expect((await POST(req(), ctx())).status).toBe(401);
    state.user = { id: "u1", email: "u@x", role: "owner" };
    expect((await POST(req(undefined, "http://evil.test"), ctx())).status).toBe(403);
    expect((await POST(req(), ctx("not-a-uuid"))).status).toBe(404);
    expect((await POST(req(null), ctx())).status).toBe(400);
    const big = new Request(
      `http://localhost:3000/api/projects/${PROJECT_ID}/upload`,
      {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "content-length": String(40_000_000),
        },
        body: JSON.stringify({ files: [{ name: "p.pdf", blobKey: OWNER_A }] }),
      },
    ) as never;
    expect((await POST(big, ctx())).status).toBe(413);
  });

  it("429 past the budget", async () => {
    state.allowed = false;
    expect((await POST(req(), ctx())).status).toBe(429);
  });

  it("201 with two owner-scoped keys, reading each object from R2", async () => {
    const res = await POST(req(), ctx());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { documents: Array<{ path: string }> };
    expect(body.documents.map((d) => d.path)).toEqual(["paper.pdf", "notes.tex"]);
    expect(state.uploadCalls).toEqual([
      {
        ownerId: "u1",
        projectId: PROJECT_ID,
        files: [
          {
            name: "paper.pdf",
            bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
            contentType: "application/pdf",
          },
          {
            name: "notes.tex",
            bytes: new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]),
            contentType: "text/plain",
          },
        ],
      },
    ]);
    // The commit route never charges quota; signing already did.
    expect(state.quotaCalls).toEqual([]);
  });

  it("400 for a key under another user, without reading or persisting it", async () => {
    const res = await POST(
      req({ files: [{ name: "evil.png", blobKey: FOREIGN }] }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(state.uploadCalls).toEqual([]);
    expect(state.quotaCalls).toEqual([]);
  });

  it("400 when an object does not exist", async () => {
    state.objects.delete(OWNER_A);
    const res = await POST(
      req({ files: [{ name: "gone.pdf", blobKey: OWNER_A }] }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(state.uploadCalls).toEqual([]);
  });

  it("413 when an object exceeds the workspace cap", async () => {
    state.objects.set(OWNER_A, {
      body: new Uint8Array([0x25]),
      size: MAX_UPLOAD_BYTES.workspace + 1,
    });
    const res = await POST(
      req({ files: [{ name: "huge.pdf", blobKey: OWNER_A }] }),
      ctx(),
    );
    expect(res.status).toBe(413);
    expect(state.uploadCalls).toEqual([]);
    expect(state.quotaCalls).toEqual([]);
  });

  it("charges quota only when signing each key, never on commit", async () => {
    const sizes = [4, 5];
    const names = ["paper.pdf", "notes.pdf"];
    const exts = ["pdf", "pdf"];
    const keys: string[] = [];
    for (let i = 0; i < sizes.length; i += 1) {
      const signReq = new Request("http://localhost:3000/api/uploads/sign", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({
          kind: "workspace",
          ext: exts[i],
          contentType: "application/pdf",
          sizeBytes: sizes[i],
        }),
      }) as never;
      const signedRes = await signPOST(signReq);
      expect(signedRes.status).toBe(201);
      const signed = (await signedRes.json()) as { key: string };
      expect(assertScopedKey("u1", "workspace", signed.key)).toBe(true);
      keys.push(signed.key);
      state.objects.set(signed.key, {
        body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        size: sizes[i]!,
      });
    }
    expect(state.quotaCalls).toEqual([
      { userId: "u1", bytes: 4 },
      { userId: "u1", bytes: 5 },
    ]);

    const res = await POST(
      req({
        files: keys.map((blobKey, i) => ({
          name: names[i],
          blobKey,
          contentType: "application/pdf",
        })),
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(state.uploadCalls).toHaveLength(1);
    // Still exactly two sign-time charges after the commit.
    expect(state.quotaCalls).toEqual([
      { userId: "u1", bytes: 4 },
      { userId: "u1", bytes: 5 },
    ]);
  });

  it("404 when the project is missing", async () => {
    state.missingProject = true;
    const res = await POST(
      req({ files: [{ name: "paper.pdf", blobKey: OWNER_A }] }),
      ctx(),
    );
    expect(res.status).toBe(404);
  });

  it("400 for a malformed body", async () => {
    expect((await POST(req({ files: [] }), ctx())).status).toBe(400);
    expect(
      (await POST(req({ files: [{ blobKey: OWNER_A }] }), ctx())).status,
    ).toBe(400);
  });
});
