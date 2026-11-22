import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import {
  chatMessages,
  projects,
  users,
} from "@spektrum/db/schema";
import type { MessagePart } from "@spektrum/shared/ai";
import {
  appendMessage,
  createThread,
  deleteThread,
  findImagePart,
  firstExchange,
  getMessage,
  getThread,
  listThreads,
  recentTurns,
  renameThread,
  touchedPaths,
  updateDiffDecision,
} from "./chat-store";

const run = Math.random().toString(36).slice(2, 10);
const userId = `chat-${run}`;
const otherId = `chat-other-${run}`;
const projectId = crypto.randomUUID();
const otherProjectId = crypto.randomUUID();
let threadId = "";

const text = (value: string): MessagePart => ({ type: "text", text: value });

beforeAll(async () => {
  await db.insert(users).values([
    { id: userId, email: `chat-${run}@test.local`, name: "C" },
    { id: otherId, email: `chat-other-${run}@test.local`, name: "O" },
  ]);
  await db.insert(projects).values([
    { id: projectId, ownerId: userId, name: "Chat" },
    { id: otherProjectId, ownerId: otherId, name: "Other" },
  ]);
  const thread = await createThread({ projectId, userId, title: "First" });
  threadId = thread.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, otherId));
  await pool.end();
});

describe("chat-store threads", () => {
  it("creates, lists, gets, renames and deletes", async () => {
    const listed = await listThreads({ projectId, userId });
    expect(listed.map((t) => t.id)).toContain(threadId);

    const got = await getThread({ threadId, userId });
    expect(got?.title).toBe("First");
    expect(got?.titleSource).toBe("fallback");

    const renamed = await renameThread({ threadId, userId, title: "Manual" });
    expect(renamed?.title).toBe("Manual");
    expect(renamed?.titleSource).toBe("manual");

    const other = await getThread({ threadId, userId: otherId });
    expect(other).toBeNull();

    const created = await createThread({
      projectId,
      userId,
      title: "Delete me",
    });
    expect(await deleteThread({ threadId: created.id, userId })).toBe(true);
    expect(await getThread({ threadId: created.id, userId })).toBeNull();
  });

  it("lists hasAssistantReply", async () => {
    const empty = await createThread({ projectId, userId, title: "Empty" });
    const before = await getThread({ threadId: empty.id, userId });
    expect(before?.hasAssistantReply).toBe(false);
    await appendMessage({
      threadId: empty.id,
      role: "assistant",
      content: { parts: [text("hi")] },
    });
    const after = await getThread({ threadId: empty.id, userId });
    expect(after?.hasAssistantReply).toBe(true);
  });
});

describe("chat-store messages", () => {
  it("appends, honours an explicit id and upserts", async () => {
    const first = await appendMessage({
      threadId,
      role: "user",
      content: { parts: [text("hello")] },
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(first.id).toBe("11111111-1111-4111-8111-111111111111");
    await appendMessage({
      threadId,
      role: "user",
      content: { parts: [text("hello again")] },
      id: "11111111-1111-4111-8111-111111111111",
    });
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId));
    expect(rows.filter((r) => r.id === first.id)).toHaveLength(1);
    const message = await getMessage({ threadId, messageId: first.id, userId });
    expect((message?.content as { parts: MessagePart[] }).parts[0]).toEqual(
      text("hello again"),
    );
  });

  it("returns the first exchange and recent turns", async () => {
    await appendMessage({ threadId, role: "user", content: { parts: [text("Q1")] } });
    await appendMessage({ threadId, role: "assistant", content: { parts: [text("A1")] } });
    for (let i = 0; i < 25; i += 1) {
      await appendMessage({ threadId, role: "user", content: { parts: [text(`Q${i}`)] } });
      await appendMessage({ threadId, role: "assistant", content: { parts: [text(`A${i}`)] } });
    }
    const exchange = await firstExchange(threadId);
    expect(exchange.user).toBe("hello again");
    expect(exchange.assistant).toBe("A1");

    const turns = await recentTurns(threadId);
    expect(turns).toHaveLength(40);
    expect(turns[0]?.text).toMatch(/^Q/);
  });

  it("returns image parts alongside text in recent turns", async () => {
    const id = crypto.randomUUID();
    const image: MessagePart = {
      type: "image",
      id,
      blobKey: `chat/${projectId}/${id}.png`,
      name: `${id}.png`,
      mimeType: "image/png",
    };
    await appendMessage({
      threadId,
      role: "user",
      // An image-only message must survive as a turn even with empty text.
      content: { parts: [image] },
    });

    const turns = await recentTurns(threadId);
    expect(turns[turns.length - 1]).toEqual({
      role: "user",
      text: "",
      images: [image],
    });
  });

  it("collects touched paths from tool calls", async () => {
    const tool = (name: string, path: string): MessagePart => ({
      type: "tool_call",
      id: crypto.randomUUID(),
      name: name as "read_file",
      args: { path },
    });
    await appendMessage({
      threadId,
      role: "assistant",
      content: { parts: [tool("read_file", "a.tex"), tool("edit_file", "b.tex"), tool("read_file", "a.tex")] },
    });
    const paths = await touchedPaths(threadId);
    expect(paths).toEqual(["a.tex", "b.tex"]);
  });

  it("finds an image part only within its thread", async () => {
    const id = crypto.randomUUID();
    const part: MessagePart = {
      type: "image",
      id,
      blobKey: `chat/${projectId}/${id}.png`,
      name: `${id}.png`,
      mimeType: "image/png",
    };
    await appendMessage({
      threadId,
      role: "user",
      content: { parts: [text("look"), part] },
    });
    expect(await findImagePart(threadId, id)).toEqual(part);
    expect(await findImagePart(threadId, crypto.randomUUID())).toBeNull();

    const otherThread = await createThread({
      projectId: otherProjectId,
      userId: otherId,
      title: "Other image",
    });
    const otherPart: MessagePart = {
      type: "image",
      id: crypto.randomUUID(),
      blobKey: `chat/${otherProjectId}/${id}.png`,
      name: `${id}.png`,
      mimeType: "image/png",
    };
    await appendMessage({
      threadId: otherThread.id,
      role: "user",
      content: { parts: [otherPart] },
    });
    expect(await findImagePart(otherThread.id, otherPart.id)).toEqual(otherPart);
    expect(await findImagePart(threadId, otherPart.id)).toBeNull();
  });

  it("flips only the matching diff part", async () => {
    const id = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const proposal = {
      path: "main.tex",
      kind: "replace" as const,
      hunks: [],
      originalHash: "h",
      proposedContent: "x",
      reason: "r",
    };
    const parts: MessagePart[] = [
      text("proposal"),
      { type: "diff", id, messageId, proposal, status: "pending" },
    ];
    await appendMessage({
      threadId,
      role: "assistant",
      content: { parts },
      id: messageId,
    });

    expect(await updateDiffDecision({ threadId, userId, messageId, diffId: id, decision: "accepted" })).toBe(true);
    const updated = await getMessage({ threadId, messageId, userId });
    const diff = (updated?.content as { parts: MessagePart[] }).parts.find(
      (p) => p.type === "diff",
    );
    expect(diff && diff.type === "diff" ? diff.status : null).toBe("accepted");

    expect(await updateDiffDecision({ threadId, userId, messageId, diffId: "missing", decision: "rejected" })).toBe(false);
  });
});