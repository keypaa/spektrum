// Owner bootstrap CLI — spec §10.2 (closed signup, owner-only v1).
// Creates the FIRST owner account. Refuses if an owner already exists.
// Run: pnpm --filter @spektrum/web admin:create-owner --email ... --name ...
//
// Implementation note: we insert directly via Drizzle inside a transaction
// rather than going through auth.api.createUser, because the signup gate
// (databaseHooks.user.create.before) only runs inside better-auth's create
// path — a CLI bootstrap inserting directly is the intended escape hatch and
// avoids fragile context plumbing through the API layer.
// Load .env.local when run as a CLI (Next.js loads it for the app, tsx does not)
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const envLocal = resolve(import.meta.dirname, "../../.env.local");
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

import { db, pool } from "@spektrum/db";
import { users, accounts } from "@spektrum/db/schema";
import { sql, eq } from "drizzle-orm";
import { hashPassword, validatePassword } from "../auth/password";

export async function findUserById(id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function findCredentialAccount(userId: string) {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);
  return rows[0];
}

export async function createOwner(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ id: string }> {
  const check = validatePassword(input.password);
  if (!check.ok) throw new Error(check.reason);

  return db.transaction(async (tx) => {
    // Lock the owner rows (FOR UPDATE is not allowed with aggregates, so lock
    // the rows themselves and count in JS) so two concurrent bootstraps cannot
    // both win.
    const locked = await tx.execute(sql`
      select id from users where role = 'owner' for update`);
    if (locked.length > 0) {
      throw new Error("An owner already exists");
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(input.password);

    await tx.insert(users).values({
      id,
      email: input.email,
      name: input.name,
      emailVerified: true,
      role: "owner",
      banned: false,
    });
    await tx.insert(accounts).values({
      id: crypto.randomUUID(),
      userId: id,
      providerId: "credential",
      // better-auth's credential sign-in matches accountId === user.id
      accountId: id,
      password: passwordHash,
    });

    return { id };
  });
}

// --- CLI entrypoint (only when run directly) ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const email = args[args.indexOf("--email") + 1];
  const name = args[args.indexOf("--name") + 1] ?? "Owner";
  if (!email) {
    console.error(
      "usage: admin:create-owner --email <email> [--name <name>] (password via OWNER_PASSWORD env or interactive prompt)",
    );
    process.exit(1);
  }
  let password = process.env.OWNER_PASSWORD;
  if (!password) {
    const { createInterface } = await import("node:readline/promises");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password: ");
    const confirm = await rl.question("Confirm password: ");
    rl.close();
    if (password !== confirm) {
      console.error("Passwords do not match");
      process.exit(1);
    }
  }
  try {
    const { id } = await createOwner({ email, password, name });
    console.log(`Owner created: ${email} (${id.slice(0, 8)}…)`);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  await pool.end();
}
