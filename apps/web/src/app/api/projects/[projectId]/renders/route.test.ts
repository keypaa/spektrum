// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitRenderBody, CommitRenderErrorCode } from "@/lib/render-commit";

const PROJECT_ID = "00000000-0000-4000-8000-000000000000";
const PDF_KEY = "u/u1/render/11111111-1111-4000-8000-000000000000.pdf";

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "u@x", role: "owner" } as null | {
    id: string;
    email: string;
    role: string;
  },
  error: null as CommitRenderErrorCode | null,
  calls: [] as Array<{
    userId: string;
    projectId: string;
    body: CommitRenderBody;
  }>,
}));

vi.mock("@/auth/session", async (io) => {
  const actual = await io<typeof import("@/auth/session")>();
  return {
    ...actual,
    requireUser: async () => {
      if (!state.user) throw new actual.UnauthorizedError();
      return state.user;
    },
  };
});

vi.mock("@/lib/render-commit", async (io) => {
  const actual = await io<typeof import("@/lib/render-commit")>();
  return {
    ...actual,
    commitRender: async (
      userId: string,
      projectId: string,
      body: CommitRenderBody,
    ) => {
      state.calls.push({ userId, projectId, body });
      if (state.error) throw new actual.CommitRenderError(state.error);
      return { revision: body.revision };
    },
  };
});

import { POST } from "./route";

const validBody: CommitRenderBody = {
  revision: "a".repeat(64),
  mainFile: "main.tex",
  pdfKey: PDF_KEY,
  synctexKey: null,
  log: "ok",
  diagnostics: [],
  stats: null,
  durationMs: 42,
};

const req = (
  body: unknown = validBody,
  origin = "http://localhost:3000",
  projectId = PROJECT_ID,
) =>
  new Request(`http://localhost:3000/api/projects/${projectId}/renders`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

const ctx = (projectId = PROJECT_ID) =>
  ({ params: Promise.resolve({ projectId }) }) as never;

beforeEach(() => {
  state.user = { id: "u1", email: "u@x", role: "owner" };
  state.error = null;
  state.calls = [];
});

describe("POST /api/projects/:projectId/renders", () => {
  it("401 unauthenticated, 403 cross-origin, 404 for a bad project id", async () => {
    state.user = null;
    expect((await POST(req(), ctx())).status).toBe(401);
    state.user = { id: "u1", email: "u@x", role: "owner" };
    expect((await POST(req(validBody, "http://evil.test"), ctx())).status).toBe(403);
    expect((await POST(req(), ctx("not-a-uuid"))).status).toBe(404);
    expect(state.calls).toEqual([]);
  });

  it("commits a valid body for the signed-in owner", async () => {
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revision: validBody.revision });
    expect(state.calls).toEqual([
      { userId: "u1", projectId: PROJECT_ID, body: validBody },
    ]);
  });

  it("maps commit failures to their HTTP status", async () => {
    const cases: Array<[CommitRenderErrorCode, number]> = [
      ["not_found", 404],
      ["bad_request", 400],
      ["too_large", 413],
    ];
    for (const [code, status] of cases) {
      state.error = code;
      const res = await POST(req(), ctx());
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: code });
    }
  });

  it("400 for a malformed body without calling commitRender", async () => {
    expect((await POST(req(null), ctx())).status).toBe(400);
    expect((await POST(req({ ...validBody, revision: "short" }), ctx())).status).toBe(400);
    expect(
      (
        await POST(
          req({ ...validBody, diagnostics: [{ severity: "bogus" }] }),
          ctx(),
        )
      ).status,
    ).toBe(400);
    expect(state.calls).toEqual([]);
  });
});
