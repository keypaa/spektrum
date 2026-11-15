// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "u1", email: "u@x", role: "owner" } as null | { id: string; email: string; role: string }, allowed: true }));
vi.mock("@/auth/session", async (io) => { const a = await io<typeof import("@/auth/session")>(); return { ...a, requireUser: async () => { if (!state.user) throw new a.UnauthorizedError(); return state.user; } }; });
vi.mock("@spektrum/shared/rate-limit", () => ({ BUDGETS: { import: { limit: 10, windowMs: 60_000 } }, consume: async () => ({ allowed: state.allowed, retryAfterMs: 1000 }) }));
vi.mock("@/lib/import/import-archive", () => ({ importArchive: async () => ({ projects: 1, files: 1, rewrittenPaths: 0, promotedMains: 0, conversationsImported: 0, conversationsSkipped: 0, rejectedPaths: [], skipped: [] }) }));

import { POST } from "./route";

const req = (init: RequestInit = {}, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/import", { method: "POST", headers: { origin }, ...init }) as never;

describe("POST /api/import", () => {
  it("401, 403 cross-origin, 400 without a file, 413 over content-length", async () => {
    state.user = null;
    expect((await POST(req())).status).toBe(401);
    state.user = { id: "u1", email: "u@x", role: "owner" };
    expect((await POST(req({}, "http://evil.test"))).status).toBe(403);
    expect((await POST(req())).status).toBe(400);
    const big = new Request("http://localhost:3000/api/import", { method: "POST", headers: { origin: "http://localhost:3000", "content-length": String(40_000_000) } }) as never;
    expect((await POST(big)).status).toBe(413);
  });

  it("429 past the budget", async () => {
    state.allowed = false;
    expect((await POST(req())).status).toBe(429);
  });
});