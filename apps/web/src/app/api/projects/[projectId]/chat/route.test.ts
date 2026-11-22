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
  baseUrl: "https://configured.example/v1",
  chatModel: "configured-chat",
  fastModel: "configured-fast",
  gatewayInput: null as null | Record<string, unknown>,
  titleInput: null as null | Record<string, unknown>,
  contextInputs: [] as Array<Record<string, unknown>>,
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  history: [] as Array<{
    role: "user" | "assistant";
    text: string;
    images: Array<{
      type: "image";
      id: string;
      blobKey: string;
      name: string;
      mimeType: string;
    }>;
  }>,
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
  resolveLlmConfigForRequest: async () =>
    state.key
      ? {
          key: "test-key",
          source: "user",
          baseUrl: state.baseUrl,
          chatModel: state.chatModel,
          fastModel: state.fastModel,
        }
      : null,
}));

vi.mock("@/lib/projects", () => ({
  getProject: async () => ({ id: PROJECT_ID, name: "P", mainDocumentId: "doc-1" }),
}));

vi.mock("@/lib/documents", () => ({
  listTree: async () => [
    { id: "doc-1", path: "main.tex", kind: "tex", updatedAt: "2026-01-01" },
  ],
}));

vi.mock("@spektrum/storage", () => ({
  StorageError: class StorageError extends Error {},
  putObject: vi.fn(
    async (_bucket: string, key: string, body: Uint8Array, contentType: string) => {
      state.objects.set(key, { body, contentType });
    },
  ),
  getObject: vi.fn(async (_bucket: string, key: string) => {
    const found = state.objects.get(key);
    if (!found) throw new Error("not_found");
    return { body: Buffer.from(found.body), size: found.body.byteLength };
  }),
}));

vi.mock("@/lib/ai/chat-store", () => ({
  createThread: async () => ({ id: "thread-1" }),
  getThread: async () => state.thread,
  appendMessage: async (input: { role: string; content: unknown; id?: string }) => {
    state.appends.push(input);
    return { id: input.id ?? `m${state.appends.length}` };
  },
  recentTurns: async () => state.history,
  touchedPaths: async () => [],
}));

vi.mock("@/lib/ai/context", () => ({
  buildContext: async (input: Record<string, unknown>) => {
    state.contextInputs.push(input);
    return { text: "CTX", tokens: 1, dropped: [] };
  },
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
  streamGateway: (input: Record<string, unknown>) => {
    state.gatewayInput = input;
    return state.gateway!();
  },
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
  generateTitle: async (input: Record<string, unknown>) => {
    state.titleInput = input;
    return state.title;
  },
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

const gatewayContent = () =>
  (
    state.gatewayInput!.messages as Array<{
      role: string;
      content: string | Array<Record<string, unknown>>;
    }>
  )[1]!.content;

const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const attachment = (id: string) => ({
  id,
  mimeType: "image/png" as const,
  data: PNG.toString("base64"),
});

/** Persist an image in history so buildUserContent can re-attach it. */
async function seedHistoryImage() {
  const blobKey = `chat/${PROJECT_ID}/${crypto.randomUUID()}.png`;
  state.objects.set(blobKey, { body: PNG, contentType: "image/png" });
  const part = {
    type: "image" as const,
    id: crypto.randomUUID(),
    blobKey,
    name: "old.png",
    mimeType: "image/png",
  };
  state.history.push({ role: "user" as const, text: "look", images: [part] });
  return part;
}

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
  state.gatewayInput = null;
  state.titleInput = null;
  state.contextInputs = [];
  state.baseUrl = "https://configured.example/v1";
  state.chatModel = "configured-chat";
  state.fastModel = "configured-fast";
  state.objects.clear();
  state.history = [];
});

describe("POST /chat", () => {
  it("rejects invalid selection ranges", async () => {
    for (const selection of [
      { path: "a.tex", startLine: -1, endLine: 2 },
      { path: "a.tex", startLine: 1, endLine: 0 },
      { path: "a.tex", startLine: 5, endLine: 2 },
    ]) {
      const res = await POST(req({ message: "hello", selection }), ctx);
      expect(res.status).toBe(400);
    }
  });

  it("forwards a valid selection to both context builds", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "reply" };
      yield { type: "done" };
    };
    const selection = { path: "a.tex", startLine: 2, endLine: 3 };
    const res = await POST(req({ message: "hello", selection }), ctx);
    expect(res.status).toBe(200);
    await res.text();
    expect(state.contextInputs.length).toBeGreaterThanOrEqual(1);
    for (const input of state.contextInputs) {
      expect(input.selection).toEqual(selection);
    }
  });

  it("uses the user's configured endpoint and models", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "reply" };
      yield { type: "done" };
    };
    const res = await POST(req({ message: "hello" }), ctx);
    expect(res.status).toBe(200);
    await res.text();
    expect(state.gatewayInput?.baseUrl).toBe("https://configured.example/v1");
    expect(state.gatewayInput?.model).toBe("configured-chat");
    expect(state.gatewayInput?.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: "compile" }),
        }),
      ]),
    );
    expect(state.titleInput?.baseUrl).toBe("https://configured.example/v1");
    expect(state.titleInput?.model).toBe("configured-fast");
  });

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

  it("stores images and persists image parts on the user message", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const res = await POST(
      req({ message: "what is this", images: [attachment("client-1")] }),
      ctx,
    );
    expect(res.status).toBe(200);
    await res.text();

    const userAppend = state.appends[0]!;
    expect(userAppend.role).toBe("user");
    const parts = (userAppend.content as { parts: Array<Record<string, unknown>> })
      .parts;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: "text", text: "what is this" });
    const imagePart = parts[1]!;
    expect(imagePart.type).toBe("image");
    expect(imagePart.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(imagePart.id).not.toBe("client-1");
    expect(imagePart.mimeType).toBe("image/png");
    expect(String(imagePart.blobKey)).toMatch(
      new RegExp(`^chat/${PROJECT_ID}/[0-9a-f-]+\\.png$`),
    );
    expect([...state.objects.keys()]).toContain(imagePart.blobKey);
  });

  it("sends a content array to the gateway when images are present", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const res = await POST(
      req({ message: "what is this", images: [attachment("client-2")] }),
      ctx,
    );
    await res.text();

    const content = gatewayContent();
    expect(Array.isArray(content)).toBe(true);
    const parts = content as Array<Record<string, unknown>>;
    expect(parts[0]).toEqual({ type: "text", text: "what is this" });
    const image = parts.find((part) => part.type === "image_url") as {
      image_url: Record<string, unknown>;
    };
    expect(image.image_url.url).toBe(
      `data:image/png;base64,${PNG.toString("base64")}`,
    );
    expect(image.image_url).not.toHaveProperty("detail");
  });

  it("keeps gateway content a plain string for text-only messages", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const res = await POST(req({ message: "hello" }), ctx);
    await res.text();
    expect(gatewayContent()).toBe("hello");
  });

  it("emits error event with retryable:false for an image rejection", async () => {
    state.gateway = async function* () {
      throw new GatewayHttpError(
        400,
        "image input not supported by model sk-abcdefgh12345678",
      );
      yield { type: "done" };
    };
    const res = await POST(
      req({ message: "what is this", images: [attachment("client-3")] }),
      ctx,
    );
    const body = await res.text();
    expect(body).toContain("event: error");
    expect(body).toContain('"retryable":false');
    expect(body).toContain("image input not supported by model");
    expect(body).toContain("Retry without images");
    expect(body).not.toContain("sk-abcdefgh12345678");
  });

  it("generates distinct server-side part ids for duplicate client ids", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const res = await POST(
      req({
        message: "two",
        images: [attachment("same-id"), attachment("same-id")],
      }),
      ctx,
    );
    await res.text();
    const parts = (
      state.appends[0]!.content as { parts: Array<Record<string, unknown>> }
    ).parts.filter((part) => part.type === "image");
    expect(parts).toHaveLength(2);
    expect(parts[0]!.id).not.toBe(parts[1]!.id);
    expect(parts[0]!.id).not.toBe("same-id");
    expect(parts[1]!.id).not.toBe("same-id");
  });

  it("keeps recent history images on a normal follow-up turn", async () => {
    await seedHistoryImage();
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const res = await POST(
      req({ message: "and now?", threadId: crypto.randomUUID() }),
      ctx,
    );
    await res.text();
    expect(Array.isArray(gatewayContent())).toBe(true);
  });

  it("omits the failed turn's images when retryWithoutImages is true", async () => {
    const historyPart = await seedHistoryImage();
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const res = await POST(
      req({
        message: "look",
        threadId: crypto.randomUUID(),
        retryWithoutImages: true,
      }),
      ctx,
    );
    await res.text();
    expect(gatewayContent()).toBe("look");
    // The original image stays persisted and truthful in the transcript.
    expect(state.objects.has(historyPart.blobKey)).toBe(true);
  });
});
