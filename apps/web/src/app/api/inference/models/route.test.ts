import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; role: string },
  allowed: true,
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

vi.mock("@spektrum/shared/rate-limit", () => ({
  BUDGETS: { ai: { limit: 30, windowMs: 60_000 } },
  consume: async () => ({ allowed: state.allowed, retryAfterMs: 1000 }),
}));

vi.mock("@/lib/ai/keys", () => ({
  resolveLlmKeyForRequest: async () => ({ key: "test-key", source: "user" }),
}));

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  state.user = null;
  state.allowed = true;
});

describe("GET /api/inference/models", () => {
  it("returns the gateway list and caches it per user", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    state.user = { id: "models-u1", email: "m1@x", role: "member" };

    const first = await GET();
    const second = await GET();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      models: [
        { id: "m1", label: "m1" },
        { id: "m2", label: "m2" },
      ],
    });
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the env models when the gateway rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    state.user = { id: "models-u2", email: "m2@x", role: "member" };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      models: [
        { id: "openai/gpt-4o", label: "openai/gpt-4o" },
        { id: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini" },
      ],
    });
  });

  it("returns 429 past the budget", async () => {
    state.allowed = false;
    state.user = { id: "models-u3", email: "m3@x", role: "member" };
    const res = await GET();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("1");
  });

  it("returns 401 without a session", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });
});