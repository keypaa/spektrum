// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "00000000-0000-4000-8000-000000000000";
const REVISION = "a".repeat(64);
const SYNC_KEY = "u/u1/render/11111111-1111-4000-8000-000000000000.synctex";

const state = vi.hoisted(() => ({
  found: { synctexKey: "u/u1/render/11111111-1111-4000-8000-000000000000.synctex" } as null | { synctexKey: string | null },
}));

vi.mock("@/auth/session", async (io) => {
  const actual = await io<typeof import("@/auth/session")>();
  return { ...actual, requireUser: async () => ({ id: "u1", role: "member" }) };
});

vi.mock("@/lib/render-store", () => ({
  getRender: async () => state.found,
}));

vi.mock("@spektrum/storage", async (io) => {
  const actual = await io<typeof import("@spektrum/storage")>();
  return {
    ...actual,
    presignDownload: vi.fn(async () => "https://r2.example/signed-synctex"),
  };
});

import { presignDownload } from "@spektrum/storage";
import { GET } from "./route";

const ctx = (projectId = PROJECT_ID, revision = REVISION) =>
  ({ params: Promise.resolve({ projectId, revision }) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  state.found = { synctexKey: SYNC_KEY };
});

describe("signed SyncTeX URL route", () => {
  it("returns a short-lived URL for the owner's scoped key", async () => {
    const res = await GET(new Request("http://localhost/") as never, ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://r2.example/signed-synctex" });
    expect(presignDownload).toHaveBeenCalledWith("pdf", SYNC_KEY);
  });

  it("does not sign a URL when the render is not owned or has no map", async () => {
    state.found = null;
    const res = await GET(new Request("http://localhost/") as never, ctx());
    expect(res.status).toBe(404);
    expect(presignDownload).not.toHaveBeenCalled();
  });

  it("rejects a malformed revision before signing", async () => {
    const res = await GET(new Request("http://localhost/") as never, ctx(PROJECT_ID, "not-a-hash"));
    expect(res.status).toBe(404);
    expect(presignDownload).not.toHaveBeenCalled();
  });
});
