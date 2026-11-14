import { eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { chatThreads } from "@spektrum/db/schema"; // corrected below
import { TITLE_PROMPT } from "@spektrum/shared/ai"; // corrected below
import { firstExchange, getThread } from "./chat-store";
import { streamGateway } from "./gateway";

export class NoAssistantError extends Error {
  constructor() {
    super("no assistant reply");
    this.name = "NoAssistantError";
  }
}

function cleanTitle(reply: string): string | null {
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: { title?: unknown };
  try {
    parsed = JSON.parse(match[0]) as { title?: unknown };
  } catch {
    return null;
  }
  if (typeof parsed.title !== "string") return null;
  let title = parsed.title.trim().replace(/^["']|["']$/g, "");
  if (/[\u0000-\u001f\u007f]/.test(title)) return null;
  if (title.length > 60) {
    title = title.slice(0, 60).replace(/\s+\S*$/, "");
  }
  return title.length > 0 ? title : null;
}

export async function generateTitle(input: {
  firstUserMessage: string;
  firstAssistantReply: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  try {
    let reply = "";
    for await (const event of streamGateway({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
      thinking: "Minimal",
      maxOutput: 64,
      messages: [
        {
          role: "user",
          content: TITLE_PROMPT(
            input.firstUserMessage,
            input.firstAssistantReply,
          ),
        },
      ],
      ...(input.signal ? { signal: input.signal } : {}),
    })) {
      if (event.type === "text") reply += event.delta;
    }
    return cleanTitle(reply);
  } catch {
    return null;
  }
}

export async function regenerateTitle(input: {
  threadId: string;
  userId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}): Promise<{ title: string; titleSource: "fallback" | "llm" | "manual" } | null> {
  const thread = await getThread({ threadId: input.threadId, userId: input.userId });
  if (!thread) return null;
  const exchange = await firstExchange(input.threadId);
  if (!exchange.assistant) throw new NoAssistantError();
  const title = await generateTitle({
    firstUserMessage: exchange.user,
    firstAssistantReply: exchange.assistant,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (!title) return { title: thread.title, titleSource: thread.titleSource };
  await db
    .update(chatThreads)
    .set({ title, titleSource: "llm", updatedAt: new Date() })
    .where(eq(chatThreads.id, input.threadId));
  return { title, titleSource: "llm" };
}