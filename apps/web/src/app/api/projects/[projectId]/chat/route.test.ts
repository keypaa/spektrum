import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = crypto.randomUUID();

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "u@x", role: "owner" } as null | {
    id: string;
    email: string;
    role: string;
  },
  allowed: true,
  key: true,
  thread: null as null | { id: string; titleSource: "fallback" | "llm" | "manual" },
  calls: 0,
  gateway: null as null | (() => AsyncGenerator<Record<string, unknown>>),
  tool: { ok: true, summary: "proposed", proposal: undefined as unknown, data: undefined as unknown },
  title: "Generated",
  appends: [] as Array<{ role: string; content: unknown; id?: string }>,
  usage: 0,
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
  resolveLlmKeyForRequest: async () =>
    state.key ? { key: "test-key", source: "user" } : null,
}));

vi.mock("@/lib/projects", () => ({
  getProject: async () => ({ id: PROJECT_ID, name: "P", mainDocumentId: "doc-1" }),
}));

vi.mock("@/lib/documents", () => ({
  listTree: async () => [
    { id: "doc-1", path: "main.tex", kind: "tex", updatedAt: "2026-01-01" },
  ],
}));

vi.mock("@/lib/ai/chat-store", () => ({
  createThread: async () => ({ id: "thread-1" }),
  getThread: async () => state.thread,
  appendMessage: async (input: { role: string; content: unknown; id?: string }) => {
    state.appends.push(input);
    return { id: input.id ?? `m${state.appends.length}` };
  },
  recentTurns: async () => [],
  touchedPaths: async () => [],
}));

vi.mock("@/lib/ai/context", () => ({
  buildContext: async () => ({ text: "CTX", tokens: 1, dropped: [] }),
}));

vi.mock("@/lib/ai/gateway", () => ({
  GatewayHttpError: class GatewayHttpError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
  streamGateway: () => state.gateway!(),
}));

vi.mock("@/lib/ai/tools", () => ({
  executeTool: async () => state.tool,
}));

vi.mock("@/lib/ai/usage", () => ({
  recordUsage: async () => {
    state.usage += 1;
  },
}));

vi.mock("@/lib/ai/title", () => ({
  generateTitle: async () => state.title,
}));

import { GatewayHttpError } from "@/lib/ai/gateway";
import { POST } from "./route";

const req = (body: unknown) =>
  new Request(`http://localhost:3000/api/projects/${PROJECT_ID}/chat`, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }) as never;
const ctx = { params: Promise.resolve({ projectId: PROJECT_ID }) };

beforeEach(() => {
  state.user = { id: "u1", email: "u@x", role: "owner" };
  state.allowed = true;
  state.key = true;
  state.thread = { id: "thread-1", titleSource: "fallback" };
  state.calls = 0;
  state.gateway = null;
  state.tool = { ok: true, summary: "proposed", proposal: undefined, data: undefined };
  state.title = "Generated";
  state.appends = [];
  state.usage = 0;
});

describe("POST /chat", () => {
  it("streams text, persists the turn and meters usage", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "hi" };
      yield { type: "usage", inputTokens: 3, outputTokens: 4 };
      yield { type: "done" };
    };
    const res = await POST(req({ message: "hello" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: meta");
    expect(body).toContain('"userMessageId":"m1"');
    expect(body).toContain("event: text");
    expect(body).toContain("event: done");
    expect(body).toContain("event: title");
    expect(state.usage).toBe(1);
    expect(state.appends[0]).toMatchObject({ role: "user" });
    expect(state.appends[1]).toMatchObject({ role: "assistant" });
  });

  it("runs a tool turn and persists the diff part", async () => {
    state.gateway = (() => {
      let call = 0;
      return async function* () {
        call += 1;
        if (call === 1) {
          yield {
            type: "tool_call_start",
            index: 0,
            id: "call-1",
            name: "edit_file",
          };
          yield {
            type: "tool_call_delta",
            index: 0,
            argsDelta: '{"path":"main.tex","oldText":"a","newText":"b","reason":"r"}',
          };
          yield { type: "usage", inputTokens: 1, outputTokens: 1 };
          yield { type: "done" };
        } else {
          yield { type: "text", delta: "Fixed" };
          yield { type: "usage", inputTokens: 2, outputTokens: 2 };
          yield { type: "done" };
        }
      };
    })();
    state.tool = {
      ok: true,
      summary: "proposed",
      proposal: {
        path: "main.tex",
        kind: "replace",
        hunks: [],
        originalHash: "h",
        proposedContent: "b",
        reason: "r",
      },
      data: undefined,
    };
    const res = await POST(req({ message: "rename" }), ctx);
    const body = await res.text();
    expect(body).toContain("event: tool_call");
    expect(body).toContain("event: tool_result");
    expect(body).toContain("event: diff");
    const assistantCalls = state.appends.filter((a) => a.role === "assistant");
    expect(assistantCalls.length).toBeGreaterThanOrEqual(2);
    expect(assistantCalls[0]!.id).toBe(assistantCalls[1]!.id);
    const final = assistantCalls[1]!.content as { parts: Array<{ type: string }> };
    expect(final.parts.some((part) => part.type === "diff")).toBe(true);
  });

  it("403s without a key and 404s another owner's thread", async () => {
    state.key = false;
    const noKey = await POST(req({ message: "hello" }), ctx);
    expect(noKey.status).toBe(403);
    state.key = true;
    state.thread = null;
    const missing = await POST(req({ message: "hello", threadId: crypto.randomUUID() }), ctx);
    expect(missing.status).toBe(404);
  });

  it("429s past the budget", async () => {
    state.allowed = false;
    const res = await POST(req({ message: "hello" }), ctx);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("1");
  });

  it("emits an error event for a gateway 401 without leaking the key", async () => {
    state.gateway = async function* () {
      throw new GatewayHttpError(401, "bad key test-key");
      yield { type: "done" };
    };
    const res = await POST(req({ message: "hello" }), ctx);
    const body = await res.text();
    expect(body).toContain("event: error");
    expect(body).toContain('"retryable":false');
    expect(body).not.toContain("test-key");
  });
});