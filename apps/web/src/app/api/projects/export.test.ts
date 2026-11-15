// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "u1", email: "u@x", role: "owner" } as null | { id: string; email: string; role: string }, allowed: true }));
vi.mock("@/auth/session", async (io) => { const a = await io<typeof import("@/auth/session")>(); return { ...a, requireUser: async () => { if (!state.user) throw new a.UnauthorizedError(); return state.user; } }; });
vi.mock("@spektrum/shared/rate-limit", () => ({ BUDGETS: { export: { limit: 30, windowMs: 60_000 } }, consume: async () => ({ allowed: state.allowed, retryAfterMs: 1000 }) }));
vi.mock("@/lib/export/build-export", async (io) => {
  const actual = await io<typeof import("@/lib/export/build-export")>();
  return {
    ...actual,
    buildProjectExport: vi.fn(
      async (_u: string, id: string) =>
        id === "11111111-1111-4111-8111-111111111111"
          ? { fileName: "P.zip", bytes: new Uint8Array([1]) }
          : null,
    ),
    buildAllExport: vi.fn(async () => ({
      fileName: "all.zip",
      bytes: new Uint8Array([2]),
    })),
  };
});
import { GET as getOne } from "./[projectId]/export/route";
import { GET as getAll } from "./export/route";

const OWNED = "11111111-1111-4111-8111-111111111111";
const ctx = (id: string) => ({ params: Promise.resolve({ projectId: id }) });

describe("export routes", () => {
  it("401, 404 for a missing project, 200 zip for the owner", async () => {
    state.user = null;
    expect((await getOne(new Request("http://x") as never, ctx(OWNED))).status).toBe(401);
    state.user = { id: "u1", email: "u@x", role: "owner" };
    expect((await getOne(new Request("http://x") as never, ctx("22222222-2222-4222-8222-222222222222"))).status).toBe(404);
    expect((await getOne(new Request("http://x") as never, ctx("not-a-uuid"))).status).toBe(404);
    const res = await getOne(new Request("http://x") as never, ctx(OWNED));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("P.zip");
  });

  it("GET /export returns the all-projects zip", async () => {
    const res = await getAll();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("all.zip");
  });

  it("answers 413 when the export exceeds the byte cap", async () => {
    const { ExportTooLargeError } = await import("@/lib/export/build-export");
    const { buildAllExport } = await import("@/lib/export/build-export");
    vi.mocked(buildAllExport).mockRejectedValueOnce(new ExportTooLargeError(999));
    const res = await getAll();
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe("too_large");
  });
});