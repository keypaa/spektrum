// Admin ban/suspension actions — spec §10.5 ban ladder.
// We do NOT call auth.api.banUser here: the plugin's endpoint requires an
// admin *session* in context, and its writes would run outside our transaction.
// Instead we perform the exact same writes (ban flags + session revocation)
// directly in one Drizzle transaction together with the admin_actions audit
// row, so a ban and its audit entry commit or roll back together.
// Semantics mirror the Admin plugin: banned=true, banReason, banExpires
// (null = permanent), and every live session of the user is revoked, which is
// what makes a pre-ban cookie die on the next request (requireUser re-checks
// ban state on every request because cookieCache is disabled).
import { eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { users, sessions, adminActions } from "@spektrum/db/schema";
import { revokeAllUserSessions } from "./revoke";

export class AdminActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminActionError";
  }
}

async function applyBan(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { actorId: string; userId: string; reason: string; until: Date | null; action: "ban" | "suspend"; ip?: string | undefined },
) {
  if (input.actorId === input.userId) {
    throw new AdminActionError("You cannot ban yourself");
  }
  const target = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (target.length === 0) {
    throw new AdminActionError("User not found");
  }
  await tx
    .update(users)
    .set({
      banned: true,
      banReason: input.reason,
      banExpires: input.until,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId));
  // revoke every live session in the DB (same transaction as the ban) — the
  // pre-ban cookie dies on next request
  await tx.delete(sessions).where(eq(sessions.userId, input.userId));
  await tx.insert(adminActions).values({
    actorId: input.actorId,
    targetId: input.userId,
    action: input.action,
    reason: input.reason,
    ip: input.ip ?? null,
  });
}

// After the ban commits, also purge Better Auth's Redis session cache via the
// internal adapter. A direct `DELETE FROM sessions` alone leaves the cached
// session (and its cached user snapshot) alive in secondary storage, which is
// exactly the stale-cookie hole this closes.
async function revokeCache(userId: string): Promise<void> {
  try {
    await revokeAllUserSessions(userId);
  } catch (e) {
    // The DB ban state is already committed and requireUser() re-reads it from
    // Postgres on every request, so a cache purge failure degrades to the
    // 403/429 path instead of letting the cookie through.
    console.error("failed to purge cached sessions for", userId, e);
  }
}

export async function banUser(input: {
  actorId: string;
  userId: string;
  reason: string;
  ip?: string | undefined;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await applyBan(tx, { ...input, until: null, action: "ban" });
  });
  await revokeCache(input.userId);
}

export async function suspendUser(input: {
  actorId: string;
  userId: string;
  until: Date;
  reason: string;
  ip?: string | undefined;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await applyBan(tx, { ...input, until: input.until, action: "suspend" });
  });
  await revokeCache(input.userId);
}

export async function unbanUser(input: {
  actorId: string;
  userId: string;
  ip?: string | undefined;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
      .where(eq(users.id, input.userId));
    await tx.insert(adminActions).values({
      actorId: input.actorId,
      targetId: input.userId,
      action: "unban",
      ip: input.ip ?? null,
    });
  });
}
