// Seed the AI e2e database (idempotent): the owner, an owner-owned
// "AI Owner Project" (with a seeded failed render so the Logs panel has a
// diagnostic), the member, and a member-owned "AI Member Project". No S3, no
// worker: the seeded `error` render stands in for a real compile.
//
//   pnpm --filter @spektrum/web exec tsx src/cli/e2e-ai-seed.ts --reset
//
// --reset also resets main.tex to \section{Intro}, removes notes.tex and
// clears both projects' chat threads, so each case starts from the same state.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const envLocal = resolve(import.meta.dirname, "../../.env.local");
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

import { and, eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { listRevisionDocuments } from "@spektrum/db/documents";
import { chatThreads, documents, pdfRenders } from "@spektrum/db/schema";
import { revisionHash } from "@spektrum/shared/revision";
import type { Diagnostic } from "@spektrum/shared/compile";
import { ensureProject, ensureUser } from "./seed-lib";

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "owner@spektrum.local";
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? "owner-password-123";
const OTHER_EMAIL = process.env.E2E_OTHER_EMAIL ?? "other@spektrum.local";
const OTHER_PASSWORD = process.env.E2E_OTHER_PASSWORD ?? "other-password-123";
const OWNER_PROJECT = "AI Owner Project";
const MEMBER_PROJECT = "AI Member Project";

const MAIN = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Intro}",
  "Hello.",
  "\\end{document}",
  "",
].join("\n");

const diagnostics: Diagnostic[] = [
  {
    severity: "error",
    message: "Undefined control sequence \\broken",
    file: "main.tex",
    line: 0,
    raw: "! Undefined control sequence \\broken",
  },
];

async function resetProject(projectId: string): Promise<void> {
  await db
    .delete(documents)
    .where(and(eq(documents.projectId, projectId), eq(documents.path, "notes.tex")));
  await db.delete(chatThreads).where(eq(chatThreads.projectId, projectId));
}

async function main(): Promise<void> {
  const ownerId = await ensureUser(OWNER_EMAIL, OWNER_PASSWORD, "E2E Owner", "owner");
  const ownerProject = await ensureProject({
    ownerId,
    name: OWNER_PROJECT,
    mainContent: MAIN,
  });
  await resetProject(ownerProject.id);

  const revision = revisionHash(await listRevisionDocuments(ownerProject.id));
  await db
    .insert(pdfRenders)
    .values({
      projectId: ownerProject.id,
      revisionHash: revision,
      mainFile: "main.tex",
      status: "error",
      diagnostics,
      log: "! Undefined control sequence \\broken\n",
    })
    .onConflictDoNothing();

  const otherId = await ensureUser(OTHER_EMAIL, OTHER_PASSWORD, "E2E Other", "member");
  const memberProject = await ensureProject({
    ownerId: otherId,
    name: MEMBER_PROJECT,
    mainContent: MAIN,
  });
  await resetProject(memberProject.id);

  console.log(`OWNER_PROJECT_ID=${ownerProject.id}`);
  console.log(`MEMBER_PROJECT_ID=${memberProject.id}`);
  await pool.end();
}

await main();