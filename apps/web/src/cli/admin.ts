// Admin CLI — spec §10.3 (ban ladder). Run through pnpm:
//
//   pnpm admin:ban <email> --actor <actorEmail> [--reason <text>]
//   pnpm admin:suspend <email> --actor <actorEmail> --minutes <n> [--reason <text>]
//   pnpm admin:unban <email> --actor <actorEmail>
//
// The actor is mandatory: `admin_actions.actor_id` is NOT NULL, so an action
// without an attributed admin cannot be recorded at all. Emails are resolved to
// ids here rather than trusted as ids.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const envLocal = resolve(import.meta.dirname, "../../.env.local");
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import { banUser, suspendUser, unbanUser } from "../auth/admin";

export function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i !== -1) return args[i + 1];
  const prefixed = args.find((a) => a.startsWith(`${flag}=`));
  return prefixed?.slice(flag.length + 1);
}

async function findUser(email: string): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Returns a process exit code. Exported so the test can drive it directly. */
export async function run(argv: string[]): Promise<number> {
  const [action, email, ...rest] = argv;
  if (!action || !email) {
    console.error(
      "usage: admin <ban|suspend|unban> <email> --actor <actorEmail> [--reason <text>] [--minutes <n>]",
    );
    return 1;
  }

  const actorEmail = argValue(rest, "--actor");
  if (!actorEmail) {
    console.error("--actor <email> is required: admin_actions.actor_id is not null");
    return 1;
  }

  const actorId = await findUser(actorEmail);
  if (!actorId) {
    console.error(`unknown actor: ${actorEmail}`);
    return 1;
  }
  const userId = await findUser(email);
  if (!userId) {
    console.error(`unknown user: ${email}`);
    return 1;
  }

  const reason = argValue(rest, "--reason") ?? "";

  if (action === "ban") {
    await banUser({ actorId, userId, reason });
  } else if (action === "suspend") {
    const minutes = Number(argValue(rest, "--minutes") ?? "0");
    if (!Number.isFinite(minutes) || minutes <= 0) {
      console.error("--minutes <positive integer> is required for suspend");
      return 1;
    }
    await suspendUser({
      actorId,
      userId,
      until: new Date(Date.now() + minutes * 60_000),
      reason,
    });
  } else if (action === "unban") {
    await unbanUser({ actorId, userId });
  } else {
    console.error(`unknown action: ${action}`);
    return 1;
  }

  console.log(`ok ${email} ${action}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await run(process.argv.slice(2));
  await pool.end();
  process.exit(code);
}