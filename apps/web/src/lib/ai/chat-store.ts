import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@spektrum/db";
import { chatMessages, chatThreads, projects } from "@spektrum/db/schema";
import type { MessagePart } from "@spektrum/shared/ai";

export interface ThreadRow {
  id: string;
  projectId: string;
  title: string;
  titleSource: "fallback" | "llm" | "manual";
  createdAt: Date;
  updatedAt: Date;
  hasAssistantReply: boolean;
}

export interface MessageRow {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: unknown;
  createdAt: Date;
}

const ownedProject = (userId: string) =>
  and(eq(projects.ownerId, userId), isNull(projects.deletedAt));

export async function createThread(input: {
  projectId: string;
  userId: string;
  title: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(chatThreads)
    .values({
      projectId: input.projectId,
      userId: input.userId,
      title: input.title,
      titleSource: "fallback",
    })
    .returning({ id: chatThreads.id });
  return { id: row!.id };
}

export async function getThread(input: {
  threadId: string;
  userId: string;
}): Promise<ThreadRow | null> {
  const [row] = await db
    .select({
      id: chatThreads.id,
      projectId: chatThreads.projectId,
      title: chatThreads.title,
      titleSource: chatThreads.titleSource,
      createdAt: chatThreads.createdAt,
      updatedAt: chatThreads.updatedAt,
    })
    .from(chatThreads)
    .innerJoin(
      projects,
      and(
        eq(chatThreads.projectId, projects.id),
        ownedProject(input.userId),
      ),
    )
    .where(eq(chatThreads.id, input.threadId))
    .limit(1);
  if (!row) return null;
  const [assistant] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.threadId, input.threadId),
        eq(chatMessages.role, "assistant"),
      ),
    )
    .limit(1);
  return { ...row, hasAssistantReply: Boolean(assistant) };
}

export async function listThreads(input: {
  projectId: string;
  userId: string;
}): Promise<ThreadRow[]> {
  return db
    .select({
      id: chatThreads.id,
      projectId: chatThreads.projectId,
      title: chatThreads.title,
      titleSource: chatThreads.titleSource,
      createdAt: chatThreads.createdAt,
      updatedAt: chatThreads.updatedAt,
      hasAssistantReply: sql<boolean>`exists (
        select 1 from ${chatMessages}
        where ${chatMessages.threadId} = ${chatThreads.id}
          and ${chatMessages.role} = 'assistant'
      )`,
    })
    .from(chatThreads)
    .innerJoin(
      projects,
      and(eq(chatThreads.projectId, projects.id), ownedProject(input.userId)),
    )
    .where(eq(chatThreads.projectId, input.projectId))
    .orderBy(desc(chatThreads.updatedAt));
}

export async function renameThread(input: {
  threadId: string;
  userId: string;
  title: string;
}): Promise<ThreadRow | null> {
  const thread = await getThread(input);
  if (!thread) return null;
  await db
    .update(chatThreads)
    .set({
      title: input.title,
      titleSource: "manual",
      updatedAt: new Date(),
    })
    .where(eq(chatThreads.id, input.threadId));
  return { ...thread, title: input.title, titleSource: "manual" };
}

export async function deleteThread(input: {
  threadId: string;
  userId: string;
}): Promise<boolean> {
  const thread = await getThread(input);
  if (!thread) return false;
  await db.delete(chatThreads).where(eq(chatThreads.id, input.threadId));
  return true;
}

export async function appendMessage(input: {
  threadId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: unknown;
  id?: string;
}): Promise<{ id: string }> {
  const id = input.id ?? crypto.randomUUID();
  await db
    .insert(chatMessages)
    .values({
      id,
      threadId: input.threadId,
      role: input.role,
      content: input.content as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: chatMessages.id,
      set: { content: input.content as Record<string, unknown> },
    });
  await db
    .update(chatThreads)
    .set({ updatedAt: new Date() })
    .where(eq(chatThreads.id, input.threadId));
  return { id };
}

export async function getMessage(input: {
  threadId: string;
  messageId: string;
  userId: string;
}): Promise<MessageRow | null> {
  const [row] = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .innerJoin(
      chatThreads,
      eq(chatMessages.threadId, chatThreads.id),
    )
    .innerJoin(
      projects,
      and(
        eq(chatThreads.projectId, projects.id),
        isNull(projects.deletedAt),
      ),
    )
    .where(
      and(
        eq(chatMessages.id, input.messageId),
        eq(chatThreads.id, input.threadId),
        ownedProject(input.userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listMessages(input: {
  threadId: string;
  userId: string;
}): Promise<MessageRow[]> {
  const thread = await getThread(input);
  if (!thread) return [];
  return db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, input.threadId))
    .orderBy(asc(chatMessages.createdAt));
}

const DECISIONS = new Set(["accepted", "rejected"]);

export async function updateDiffDecision(input: {
  threadId: string;
  userId: string;
  messageId: string;
  diffId: string;
  decision: "accepted" | "rejected";
}): Promise<boolean> {
  if (!DECISIONS.has(input.decision)) return false;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ content: chatMessages.content })
      .from(chatMessages)
      .innerJoin(chatThreads, eq(chatMessages.threadId, chatThreads.id))
      .innerJoin(
        projects,
        and(
          eq(chatThreads.projectId, projects.id),
          ownedProject(input.userId),
        ),
      )
      .where(
        and(
          eq(chatMessages.id, input.messageId),
          eq(chatThreads.id, input.threadId),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) return false;
    const content = row.content as { parts?: MessagePart[] };
    const parts = content.parts ?? [];
    const part = parts.find(
      (candidate) => candidate.type === "diff" && candidate.id === input.diffId,
    );
    if (!part || part.type !== "diff") return false;
    part.status = input.decision;
    await tx
      .update(chatMessages)
      .set({ content: { ...content, parts } })
      .where(eq(chatMessages.id, input.messageId));
    return true;
  });
}

export async function firstExchange(threadId: string): Promise<{
  user: string;
  assistant: string;
}> {
  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatMessages.createdAt));
  let user = "";
  let assistant = "";
  for (const row of rows) {
    const parts = (row.content as { parts?: MessagePart[] }).parts ?? [];
    const text = parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
    if (!user && row.role === "user") user = text;
    if (!assistant && row.role === "assistant") assistant = text;
  }
  return { user, assistant };
}

export async function recentTurns(threadId: string): Promise<
  Array<{ role: "user" | "assistant"; text: string }>
> {
  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(40);
  return rows
    .reverse()
    .flatMap((row) => {
      if (row.role !== "user" && row.role !== "assistant") return [];
      const parts = (row.content as { parts?: MessagePart[] }).parts ?? [];
      const text = parts
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
      return text ? [{ role: row.role, text }] : [];
    });
}

/** Find the image part for an attachment within a thread, or null.
 *
 * Ownership is deliberately not checked here: callers scope the lookup with
 * `getThread({ threadId, userId })` first (project owner only).
 */
export async function findImagePart(
  threadId: string,
  attachmentId: string,
): Promise<Extract<MessagePart, { type: "image" }> | null> {
  const rows = await db
    .select({ content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId));
  for (const row of rows) {
    const parts = (row.content as { parts?: MessagePart[] }).parts ?? [];
    for (const part of parts) {
      if (part.type === "image" && part.id === attachmentId) return part;
    }
  }
  return null;
}

export async function touchedPaths(threadId: string): Promise<string[]> {
  const rows = await db
    .select({ content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId));
  const paths = new Set<string>();
  for (const row of rows) {
    const parts = (row.content as { parts?: MessagePart[] }).parts ?? [];
    for (const part of parts) {
      if (part.type !== "tool_call") continue;
      if (part.name !== "read_file" && part.name !== "edit_file") continue;
      const path = (part.args as { path?: unknown } | null)?.path;
      if (typeof path === "string") paths.add(path);
    }
  }
  return [...paths];
}