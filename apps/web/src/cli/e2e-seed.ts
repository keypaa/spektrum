// Seed the compile e2e database (idempotent): the owner, the example project
// (main.tex + diagram.jpg blob), and the second user. Lives in apps/web so
// workspace deps resolve; run with:
//   pnpm --filter @spektrum/web exec tsx src/cli/e2e-seed.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const envLocal = resolve(import.meta.dirname, "../../.env.local");
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { documents, projects, users } from "@spektrum/db/schema";
import { ensureBucket, putObject } from "@spektrum/storage";
import { ensureUser } from "./seed-lib";
import { EXAMPLE_MAIN_TEX } from "../lib/templates";

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "owner@spektrum.local";
const OWNER_PASSWORD =
  process.env.E2E_OWNER_PASSWORD ?? "owner-password-123";
const OTHER_EMAIL = process.env.E2E_OTHER_EMAIL ?? "other@spektrum.local";
const OTHER_PASSWORD =
  process.env.E2E_OTHER_PASSWORD ?? "other-password-123";
const PROJECT = "New Project";

const root = resolve(import.meta.dirname, "../../../..");

await ensureBucket("pdf");
await ensureBucket("uploads");

// Recreate the owner each run: the compile budget is per user id, and the
// seven cases together exceed 6 compiles/minute on one id.
await db.delete(users).where(eq(users.email, OWNER_EMAIL));
const ownerId = await ensureUser(OWNER_EMAIL, OWNER_PASSWORD, "E2E Owner", "owner");
await db
  .delete(projects)
  .where(and(eq(projects.ownerId, ownerId), eq(projects.name, PROJECT)));

const [project] = await db
  .insert(projects)
  .values({ ownerId, name: PROJECT })
  .returning({ id: projects.id });
const projectId = project!.id;

const example = EXAMPLE_MAIN_TEX;
const [main] = await db
  .insert(documents)
  .values({
    projectId,
    path: "main.tex",
    kind: "tex",
    content: example,
  })
  .returning({ id: documents.id });
await db
  .update(projects)
  .set({ mainDocumentId: main!.id })
  .where(eq(projects.id, projectId));

const image = readFileSync(
  resolve(root, "packages/latex/fixtures/src/diagram.jpg"),
);
const blobKey = createHash("sha256").update(image).digest("hex");
await putObject("uploads", blobKey, image, "image/jpeg");
await db.insert(documents).values({
  projectId,
  path: "diagram.jpg",
  kind: "img",
  blobKey,
});

const longBody =
  "\\documentclass{article}\n\\begin{document}\n" +
  Array.from({ length: 20 }, () => "Page content.\\newpage").join("\n") +
  "\n\\end{document}\n";
await db.insert(documents).values({
  projectId,
  path: "long.tex",
  kind: "tex",
  content: longBody,
});

const otherId = await ensureUser(OTHER_EMAIL, OTHER_PASSWORD, "E2E Other", "member");

console.log(
  `seeded ${PROJECT} (${projectId}) owner=${ownerId.slice(0, 8)} other=${otherId.slice(0, 8)}`,
);
await pool.end();