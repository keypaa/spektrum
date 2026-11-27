// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "sign-u1", email: "u1@example.test", role: "member" } as null | {
    id: string;
    email: string;
    role: string;
  },
  quotaAllowed: true,
  quotaCalls: [] as Array<{ userId: string; bytes: number }>,
}));

vi.mock("@/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/session")>();
  return {
    ...actual,
    requireUser: async () => {
      if (!state.user) throw new actual.UnauthorizedError();
      return state.user;
    },
  };
});

vi.mock("@/lib/upload/quotas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/upload/quotas")>();
  return {
    ...actual,
    consumeStorageQuota: async (userId: string, bytes: number) => {
      state.quotaCalls.push({ userId, bytes });
      return {
        allowed: state.quotaAllowed,
        retryAfterMs: 86_400_000,
      };
    },
  };
});

import { assertScopedKey } from "@/lib/upload/scoped-key";
import { MAX_UPLOAD_BYTES } from "@/lib/upload/quotas";
import { POST, type SignUploadResult } from "./route";

const req = (
  body: unknown = {
    kind: "render",
    ext: "pdf",
    contentType: "application/pdf",
    sizeBytes: 1024,
  },
  origin = "http://localhost:3000",
) =>
  new Request("http://localhost:3000/api/uploads/sign", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

afterEach(() => {
  state.user = { id: "sign-u1", email: "u1@example.test", role: "member" };
  state.quotaAllowed = true;
  state.quotaCalls = [];
});

describe("POST /api/uploads/sign", () => {
  it("401 without a session, 403 cross-origin", async () => {
    state.user = null;
    expect((await POST(req())).status).toBe(401);
    state.user = { id: "sign-u1", email: "u1@example.test", role: "member" };
    expect((await POST(req(undefined, "http://evil.test"))).status).toBe(403);
  });

  it("201 with a scoped key, a short-lived signed PUT URL and the signed headers", async () => {
    const res = await POST(req());
    expect(res.status).toBe(201);
    const result = (await res.json()) as SignUploadResult;
    expect(assertScopedKey(state.user!.id, "render", result.key)).toBe(true);
    expect(result.key).toMatch(/\.pdf$/);
    expect(result.url).toContain(result.key);
    expect(result.url).toContain(`/${process.env.S3_PDF_BUCKET ?? "spektrum-pdf"}/`);
    expect(Object.keys(result).sort()).toEqual(["expiresAt", "headers", "key", "url"]);
    const url = new URL(result.url);
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(900);
    expect(result.headers).toEqual({ "Content-Type": "application/pdf" });
    expect(Number.isNaN(Date.parse(result.expiresAt))).toBe(false);
    expect(state.quotaCalls).toEqual([{ userId: "sign-u1", bytes: 1024 }]);
  });

  it("201 signs non-render kinds into the uploads bucket with a scoped key", async () => {
    const res = await POST(
      req({
        kind: "import",
        ext: "zip",
        contentType: "application/zip",
        sizeBytes: 4096,
      }),
    );
    expect(res.status).toBe(201);
    const result = (await res.json()) as SignUploadResult;
    expect(assertScopedKey(state.user!.id, "import", result.key)).toBe(true);
    expect(result.key).toMatch(/\.zip$/);
    expect(result.url).toContain(result.key);
    expect(result.url).toContain(`/${process.env.S3_BUCKET ?? "spektrum-uploads"}/`);
    expect(result.url).not.toContain(`/${process.env.S3_PDF_BUCKET ?? "spektrum-pdf"}/`);
    expect(Object.keys(result).sort()).toEqual(["expiresAt", "headers", "key", "url"]);
  });

  it("413 when the declared size exceeds the kind's cap", async () => {
    const res = await POST(
      req({
        kind: "chat-image",
        ext: "png",
        contentType: "image/png",
        sizeBytes: MAX_UPLOAD_BYTES["chat-image"] + 1,
      }),
    );
    expect(res.status).toBe(413);
    // Reject the declaration before minting (and before charging quota).
    expect(state.quotaCalls).toEqual([]);
  });

  it("429 with Retry-After when the storage quota is exhausted", async () => {
    state.quotaAllowed = false;
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("400 for an unknown kind, a bad extension or a non-integral size", async () => {
    expect(
      (
        await POST(
          req({ kind: "evil", ext: "pdf", contentType: "application/pdf", sizeBytes: 1 }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(req({ kind: "import", ext: "../zip", contentType: "application/zip", sizeBytes: 1 }))).status,
    ).toBe(400);
    expect(
      (await POST(req({ kind: "import", ext: "zip", contentType: "application/zip", sizeBytes: 1.5 }))).status,
    ).toBe(400);
  });
});
