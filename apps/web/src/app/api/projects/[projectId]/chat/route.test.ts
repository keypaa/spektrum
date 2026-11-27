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

/** A key of the shape minted by /api/uploads/sign for the signed-in user. */
const scopedKey = (
  id = crypto.randomUUID(),
  userId = "u1",
  kind = "chat-image",
) => `u/${userId}/${kind}/${id}.png`;

/** Chat now carries uploaded blob keys, not inline base64. */
const imageRef = (id = crypto.randomUUID(), blobKey = scopedKey()) => ({
  id,
  blobKey,
  mimeType: "image/png" as const,
  name: "shot.png",
});

function seedImage(ref: { blobKey: string; mimeType: string }, bytes = PNG): void {
  state.objects.set(ref.blobKey, { body: bytes, contentType: ref.mimeType });
}

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

  it("persists the uploaded key as an image part on the user message", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const ref = imageRef("client-1");
    seedImage(ref);
    const res = await POST(
      req({ message: "what is this", images: [ref] }),
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
    expect(parts[1]).toEqual({
      type: "image",
      id: "client-1",
      blobKey: ref.blobKey,
      name: "shot.png",
      mimeType: "image/png",
    });
  });

  it("builds one text part and one image_url data URL from the uploaded object", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const ref = imageRef("client-2");
    seedImage(ref);
    const res = await POST(
      req({ message: "what is this", images: [ref] }),
      ctx,
    );
    await res.text();

    const content = gatewayContent();
    expect(content).toEqual([
      { type: "text", text: "what is this" },
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${PNG.toString("base64")}` },
      },
    ]);
  });

  it("rejects a key owned by another user before reading or persisting it", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const foreign = imageRef("foreign", scopedKey("foreign-uuid", "u2"));
    seedImage(foreign);
    const res = await POST(
      req({ message: "what is this", images: [foreign] }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(state.gatewayInput).toBeNull();
    expect(state.appends).toHaveLength(0);
  });

  it("rejects a key of a different upload kind with 400", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const importKey = imageRef("wrong-kind", scopedKey("k", "u1", "import"));
    seedImage(importKey);
    const res = await POST(
      req({ message: "what is this", images: [importKey] }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(state.gatewayInput).toBeNull();
  });

  it("omits a missing object with a marker instead of failing the turn", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const missing = imageRef("missing"); // no object seeded
    const res = await POST(
      req({ message: "what is this", images: [missing] }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain("event: error");
    expect(gatewayContent()).toEqual([
      { type: "text", text: "what is this" },
      { type: "text", text: "[image omitted — re-attach to discuss]" },
    ]);
    // A key whose object vanished must not be persisted in the transcript.
    const parts = (
      state.appends[0]!.content as { parts: Array<Record<string, unknown>> }
    ).parts;
    expect(parts).toEqual([{ type: "text", text: "what is this" }]);
  });

  it("rejects an object whose actual size exceeds 1 MiB", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const oversized = imageRef("oversized");
    seedImage(oversized, Buffer.alloc(1024 * 1024 + 1, 7));
    const res = await POST(
      req({ message: "what is this", images: [oversized] }),
      ctx,
    );
    expect(res.status).toBe(413);
    expect(state.gatewayInput).toBeNull();
    expect(state.appends).toHaveLength(0);
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
    const image = imageRef("client-3");
    seedImage(image);
    const res = await POST(
      req({ message: "what is this", images: [image] }),
      ctx,
    );
    const body = await res.text();
    expect(body).toContain("event: error");
    expect(body).toContain('"retryable":false');
    expect(body).toContain("image input not supported by model");
    expect(body).toContain("Retry without images");
    expect(body).not.toContain("sk-abcdefgh12345678");
  });

  it("keeps a ref's id but regenerates on a collision within the request", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const first = imageRef("same-id");
    const second = imageRef("same-id");
    seedImage(first);
    seedImage(second);
    const res = await POST(
      req({ message: "two", images: [first, second] }),
      ctx,
    );
    await res.text();
    const parts = (
      state.appends[0]!.content as { parts: Array<Record<string, unknown>> }
    ).parts.filter((part) => part.type === "image");
    expect(parts).toHaveLength(2);
    expect(parts[0]!.id).toBe("same-id");
    expect(parts[1]!.id).not.toBe("same-id");
    expect(parts[1]!.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("generates a server-side id when the ref has no usable id", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const ref = imageRef("");
    seedImage(ref);
    const res = await POST(req({ message: "one", images: [ref] }), ctx);
    await res.text();
    const image = (
      state.appends[0]!.content as { parts: Array<Record<string, unknown>> }
    ).parts.find((part) => part.type === "image")!;
    expect(image.id).toMatch(/^[0-9a-f-]{36}$/i);
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

  it("413s a declared body over 8 MiB before parsing or rate limiting", async () => {
    state.allowed = false; // would be a 429 if we got as far as the limiter
    const oversized = new Request(
      `http://localhost:3000/api/projects/${PROJECT_ID}/chat`,
      {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "content-length": String(9 * 1024 * 1024),
        },
        body: JSON.stringify({ message: "hello" }),
      },
    ) as never;
    const res = await POST(oversized, ctx);
    expect(res.status).toBe(413);
    expect(state.gatewayInput).toBeNull();
  });

  it("a plain follow-up after a rejected image sends plain string content", async () => {
    await seedHistoryImage();
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const res = await POST(
      req({
        message: "just text now",
        threadId: crypto.randomUUID(),
        omitHistoryImages: true,
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    await res.text();
    // No array, no image parts, no omission marker — byte-for-byte plain.
    expect(gatewayContent()).toBe("just text now");
  });

  it("a retry reuses the failed user row and keeps meta.userMessageId", async () => {
    state.gateway = async function* () {
      yield { type: "text", delta: "ok" };
    };
    const res = await POST(
      req({
        message: "look",
        threadId: crypto.randomUUID(),
        retryWithoutImages: true,
        omitHistoryImages: true,
        retryOfMessageId: "failed-user-id",
      }),
      ctx,
    );
    const body = await res.text();
    expect(body).toContain('"userMessageId":"failed-user-id"');
    // Only the assistant reply is appended; the user row is reused.
    expect(state.appends.some((append) => append.role === "user")).toBe(false);
    expect(state.appends.filter((append) => append.role === "assistant")).toHaveLength(1);
  });
});
