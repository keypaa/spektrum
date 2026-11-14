// Seed the AI visual fixture: one thread with a user turn, an assistant turn
// and a pending diff part, attached to the first "New Project". Idempotent; the
// visual spec opens the editor with `?thread=<id>` so the transcript and the
// diff widget render from the persisted parts.
//
//   pnpm --filter @spektrum/web visual:ai-seed
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const envLocal = resolve(import.meta.dirname, "../../.env.local");
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

import { and, asc, eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import {
  chatMessages,
  chatThreads,
  documents,
  projects,
  users,
} from "@spektrum/db/schema";
import { structuredPatch } from "@spektrum/shared/ai/diff";

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "owner@spektrum.local";
const DIFF_ID = "visual-diff-1";
const ASSISTANT_ID = "00000000-0000-4000-8000-000000000001";

async function main(): Promise<void> {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, OWNER_EMAIL));
  if (!owner) throw new Error("visual-ai-seed: owner missing (run visual:seed first)");

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.ownerId, owner.id), eq(projects.name, "New Project")))
    .orderBy(asc(projects.createdAt))
    .limit(1);
  if (!project) throw new Error("visual-ai-seed: New Project missing");

  await db.delete(chatThreads).where(eq(chatThreads.projectId, project.id));

  const [thread] = await db
    .insert(chatThreads)
    .values({
      projectId: project.id,
      userId: owner.id,
      title: "Rename the introduction",
      titleSource: "llm",
    })
    .returning({ id: chatThreads.id });
  const threadId = thread!.id;

  const [main] = await db
    .select({ content: documents.content })
    .from(documents)
    .where(
      and(eq(documents.projectId, project.id), eq(documents.path, "main.tex")),
    );
  const original = main?.content ?? "";
  const proposed = original.replace("\\section{Intro}", "\\section{Introduction}");
  const hunks = structuredPatch(
    "main.tex",
    "main.tex",
    original,
    proposed,
    "",
    "",
  ).hunks;

  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    threadId,
    role: "user",
    content: { parts: [{ type: "text", text: "Rename the introduction" }] },
  });
  await db.insert(chatMessages).values({
    id: ASSISTANT_ID,
    threadId,
    role: "assistant",
    content: {
      parts: [
        { type: "text", text: "I'll rename the introduction." },
        {
          type: "diff",
          id: DIFF_ID,
          messageId: ASSISTANT_ID,
          proposal: {
            path: "main.tex",
            kind: "replace",
            hunks,
            originalHash: "",
            proposedContent: proposed,
            reason: "rename the introduction",
          },
          status: "pending",
        },
      ],
    },
  });

  console.log(`VISUAL_AI_PROJECT_ID=${project.id}`);
  console.log(`VISUAL_AI_THREAD_ID=${threadId}`);
  await pool.end();
}

await main();