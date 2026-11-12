// Visual fixture seed — deterministic project list for the pixel-diff suite.
// Run: pnpm --filter @spektrum/web visual:seed light|dark|empty|editor
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const envLocal = resolve(import.meta.dirname, "../../.env.local");
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { documents, folders, projects, userPreferences, users } from "@spektrum/db/schema";
import { BLANK_MAIN_TEX } from "../lib/templates";
import { createOwner } from "./create-owner";

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "owner@spektrum.local";
const OWNER_NAME = "Keylhan Paumard";

const LIGHT: Array<[string, number]> = [
  ["New Project", 2],
  ["New Project", 2],
  ["New Project", 18],
  ["New Project", 28],
  ["Challenge Me 3", 183],
  ["Nouveau projet", 183],
  ["Copie de PRJ - LINEAR ALGEBRA - V2", 183],
  ["Challenge Me 2", 183],
  ["Lab 1 - Fibonacci Sequence", 183],
  ["Challenge Me 1", 183],
  ["PRJ - LINEAR ALGEBRA - V2", 183],
  ["PRJ - LINEAR ALGEBRA - V1", 183],
  ["Nouveau projet", 183],
  ["Nouveau projet", 183],
  ["Nouveau projet", 183],
  ["Linear Algebra - PRJ", 183],
  ["Nouveau projet", 274],
];

const DARK: Array<[string, number]> = [
  ["New Project", 16],
  ["New Project", 26],
  ["Challenge Me 3", 152],
  ["Nouveau projet", 183],
  ["Copie de PRJ - LINEAR ALGEBRA - V2", 183],
  ["Challenge Me 2", 183],
  ["Lab 1 - Fibonacci Sequence", 183],
  ["Challenge Me 1", 183],
  ["PRJ - LINEAR ALGEBRA - V2", 183],
  ["PRJ - LINEAR ALGEBRA - V1", 183],
  ["Nouveau projet", 183],
  ["Nouveau projet", 183],
  ["Nouveau projet", 183],
  ["Linear Algebra - PRJ", 183],
  ["Nouveau projet", 274],
];

const EMPTY: Array<[string, number]> = [];

const arg = process.argv[2];
const dataset = arg === "light" ? LIGHT : arg === "empty" ? EMPTY : DARK;
const isEditor = arg === "editor";

// Mirror ci-seed.ts: create the owner if it does not exist yet (CI runs this
// seed without a prior ci-seed step).
let [owner] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, OWNER_EMAIL))
  .limit(1);
if (!owner) {
  // `createOwner` refuses if ANY owner already exists (not just this email),
  // so a dev database bootstrapped with a personal address must be pointed at
  // via E2E_OWNER_EMAIL rather than silently seeding a second owner.
  try {
    const { id } = await createOwner({
      email: OWNER_EMAIL,
      password: process.env.E2E_OWNER_PASSWORD ?? "owner-password-123",
      name: OWNER_NAME,
    });
    owner = { id };
    console.log(`created owner ${OWNER_EMAIL}`);
  } catch (e) {
    console.error(
      `${(e as Error).message}\n` +
        `visual-seed needs the owner ${OWNER_EMAIL}. Set E2E_OWNER_EMAIL to the existing owner's address.`,
    );
    await pool.end();
    process.exit(1);
  }
}

await db.update(users).set({ name: OWNER_NAME }).where(eq(users.id, owner.id));
await db.delete(projects).where(eq(projects.ownerId, owner.id));
await db.delete(folders).where(eq(folders.ownerId, owner.id));
// The settings baselines assert control positions, so a preferences row left
// over from an earlier run must not survive the re-seed.
await db.delete(userPreferences).where(eq(userPreferences.userId, owner.id));

if (isEditor) {
  // Exactly one project named "New Project" with a single main.tex holding the
  // blank template — this is what both editor baselines open.
  const [project] = await db
    .insert(projects)
    .values({ ownerId: owner.id, name: "New Project" })
    .returning({ id: projects.id });
  const [doc] = await db
    .insert(documents)
    .values({
      projectId: project!.id,
      path: "main.tex",
      kind: "tex",
      content: BLANK_MAIN_TEX,
    })
    .returning({ id: documents.id });
  await db
    .update(projects)
    .set({ mainDocumentId: doc!.id })
    .where(eq(projects.id, project!.id));
  console.log(`seeded editor fixture (project ${project!.id}) for ${OWNER_EMAIL}`);
  await pool.end();
  process.exit(0);
}

const now = Date.now();
for (let i = 0; i < dataset.length; i++) {
  const [name, days] = dataset[i]!;
  await db.insert(projects).values({
    ownerId: owner.id,
    name,
    // Each later row is one hour older so the `createdAt desc` order is total
    // even when many rows share the same day offset.
    createdAt: new Date(now - days * 86_400_000 - i * 3_600_000),
  });
}

console.log(`seeded ${dataset.length} projects for ${OWNER_EMAIL}`);
await pool.end();
