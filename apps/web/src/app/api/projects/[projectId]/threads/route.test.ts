import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { chatMessages, projects, users } from "@spektrum/db/schema";
import type { MessagePart } from "@spektrum/shared/ai"; // corrected below

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; role: string },
  allowed: true,
  key: true,
  title: { title: "Generated", titleSource: "llm" as const },
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

vi.mock("@/lib/ai/keys", async () => {
  const { loadWebEnv } = await import("@spektrum/shared/env");
  const env = loadWebEnv();
  return {
    resolveLlmKeyForRequest: async () =>
      state.key ? { key: "test-key", source: "user" } : null,
    resolveLlmConfigForRequest: async () =>
      state.key
        ? {
            key: "test-key",
            source: "user",
            baseUrl: env.llmBaseUrl,
            chatModel: env.llmModelChat,
            fastModel: env.llmModelFast,
          }
        : null,
  };
});

vi.mock("@/lib/ai/title", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/title")>();
  return { ...actual, regenerateTitle: async () => state.title };
});

import { appendMessage, createThread } from "@/lib/ai/chat-store";
import { GET as getThreadRoute, PATCH as patchThread, DELETE as deleteThreadRoute } from "./[threadId]/route";
import { GET as listThreads } from "./route";
import { POST as regenerate } from "./[threadId]/title/regenerate/route";
import { PATCH as patchMessage } from "./[threadId]/messages/[messageId]/route";

const run = Math.random().toString(36).slice(2, 10);
const ownerId = `thread-owner-${run}`;
const otherId = `thread-other-${run}`;
const projectId = crypto.randomUUID();
const otherProjectId = crypto.randomUUID();
let threadId = "";
let assistantThreadId = "";
let otherThreadId = "";
const ORIGIN = "http://localhost:3000";

const req = (method: string, url: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { origin: ORIGIN, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;

const project = (id: string) => ({ params: Promise.resolve({ projectId: id }) });
const thread = (id: string) => ({ params: Promise.resolve({ projectId, threadId: id }) });
const message = (id: string, m: string) => ({ params: Promise.resolve({ projectId, threadId: id, messageId: m }) });

beforeAll(async () => {
  await db.insert(users).values([
    { id: ownerId, email: `thread-owner-${run}@test.local`, name: "O" },
    { id: otherId, email: `thread-other-${run}@test.local`, name: "T" },
  ]);
  await db.insert(projects).values([
    { id: projectId, ownerId, name: "Threads" },
    { id: otherProjectId, ownerId: otherId, name: "Other" },
  ]);
  threadId = (await createThread({ projectId, userId: ownerId, title: "First" })).id;
  assistantThreadId = (await createThread({ projectId, userId: ownerId, title: "Assistant" })).id;
  await appendMessage({
    threadId: assistantThreadId,
    role: "user",
    content: { parts: [{ type: "text", text: "hi" }] },
  });
  await appendMessage({
    threadId: assistantThreadId,
    role: "assistant",
    content: { parts: [{ type: "text", text: "hello" }] },
  });
  otherThreadId = (await createThread({ projectId: otherProjectId, userId: otherId, title: "Other" })).id;
});

afterEach(() => {
  state.user = { id: ownerId, email: "owner@x", role: "owner" };
  state.allowed = true;
  state.key = true;
  state.title = { title: "Generated", titleSource: "llm" };
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, otherId));
  await pool.end();
});

describe("thread routes", () => {
  it("lists threads and returns 401 without a session", async () => {
    state.user = { id: ownerId, email: "owner@x", role: "owner" };
    const res = await listThreads(req("GET", `${ORIGIN}/api/projects/${projectId}/threads`), project(projectId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.threads.map((t: { id: string }) => t.id)).toContain(threadId);
    state.user = null;
    const anon = await listThreads(req("GET", `${ORIGIN}/api/projects/${projectId}/threads`), project(projectId));
    expect(anon.status).toBe(401);
  });

  it("renames and deletes a thread", async () => {
    const renamed = await patchThread(
      req("PATCH", `${ORIGIN}/api/projects/${projectId}/threads/${threadId}`, { title: "Manual" }),
      thread(threadId),
    );
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).thread.titleSource).toBe("manual");

    const created = await createThread({ projectId, userId: ownerId, title: "Delete" });
    const deleted = await deleteThreadRoute(
      req("DELETE", `${ORIGIN}/api/projects/${projectId}/threads/${created.id}`),
      thread(created.id),
    );
    expect(deleted.status).toBe(204);
  });

  it("flips a diff decision", async () => {
    const diffThread = (await createThread({ projectId, userId: ownerId, title: "Diff" })).id;
    const messageId = crypto.randomUUID();
    const proposal = {
      path: "main.tex",
      kind: "replace" as const,
      hunks: [],
      originalHash: "h",
      proposedContent: "x",
      reason: "r",
    };
    const diffPart: MessagePart = {
      type: "diff",
      id: "d1",
      messageId,
      proposal,
      status: "pending",
    };
    await appendMessage({
      threadId: diffThread,
      role: "assistant",
      id: messageId,
      content: { parts: [{ type: "text", text: "proposal" }, diffPart] },
    });

    const res = await patchMessage(
      req("PATCH", `${ORIGIN}/api/projects/${projectId}/threads/${diffThread}/messages/${messageId}`, {
        diffId: "d1",
        decision: "accepted",
      }),
      message(diffThread, messageId),
    );
    expect(res.status).toBe(200);
    const row = await db.select({ content: chatMessages.content }).from(chatMessages).where(eq(chatMessages.id, messageId));
    const part = (row[0]!.content as { parts: MessagePart[] }).parts.find((p) => p.type === "diff");
    expect(part && part.type === "diff" ? part.status : null).toBe("accepted");

    const bad = await patchMessage(
      req("PATCH", `${ORIGIN}/api/projects/${projectId}/threads/${diffThread}/messages/${messageId}`, {
        diffId: "d1",
        decision: "maybe",
      }),
      message(diffThread, messageId),
    );
    expect(bad.status).toBe(400);
  });

  it("regenerates a title, 409s without an assistant reply, 429s and 403s", async () => {
    const none = await regenerate(
      req("POST", `${ORIGIN}/api/projects/${projectId}/threads/${threadId}/title/regenerate`),
      thread(threadId),
    );
    expect(none.status).toBe(409);

    const ok = await regenerate(
      req("POST", `${ORIGIN}/api/projects/${projectId}/threads/${assistantThreadId}/title/regenerate`),
      thread(assistantThreadId),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ title: "Generated", titleSource: "llm" });

    state.allowed = false;
    const limited = await regenerate(
      req("POST", `${ORIGIN}/api/projects/${projectId}/threads/${assistantThreadId}/title/regenerate`),
      thread(assistantThreadId),
    );
    expect(limited.status).toBe(429);

    state.allowed = true;
    state.key = false;
    const noKey = await regenerate(
      req("POST", `${ORIGIN}/api/projects/${projectId}/threads/${assistantThreadId}/title/regenerate`),
      thread(assistantThreadId),
    );
    expect(noKey.status).toBe(403);
  });

  it("404s another owner's thread", async () => {
    const res = await getThreadRoute(
      req("GET", `${ORIGIN}/api/projects/${otherProjectId}/threads/${otherThreadId}`),
      { params: Promise.resolve({ projectId: otherProjectId, threadId: otherThreadId }) },
    );
    expect(res.status).toBe(404);
  });
});