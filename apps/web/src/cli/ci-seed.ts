// CI seed — creates the e2e owner account in the CI database (idempotent).
// Run from the repo root:
//   E2E_OWNER_EMAIL=owner@spektrum.local npx tsx apps/web/src/cli/ci-seed.ts
// (Lives in apps/web so workspace deps resolve; DATABASE_URL comes from env.)
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import { createOwner } from "./create-owner";

const email = process.env.E2E_OWNER_EMAIL ?? "owner@spektrum.local";
const password = process.env.E2E_OWNER_PASSWORD ?? "owner-password-123";

const existing = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.role, "owner"))
  .limit(1);

if (existing.length > 0) {
  console.log(`owner already exists: ${existing[0]!.id}`);
} else {
  const { id } = await createOwner({ email, password, name: "CI Owner" });
  console.log(`seeded owner ${email} (${id.slice(0, 8)}…)`);
}

await pool.end();
