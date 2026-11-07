// Invite-only registration — spec §10.2 (closed signup in v1).
// createInvite stores only sha256(token); redeemInvite consumes the invite with
// `UPDATE ... RETURNING` inside a transaction — the accepted_user_id unique
// index is the race backstop, so exactly one concurrent redemption wins.
import { createHash, randomBytes } from "node:crypto";
import { db } from "@spektrum/db";
import { invites, users, accounts } from "@spektrum/db/schema";
import { eq, sql, and, isNull } from "drizzle-orm";
import { hashPassword, validatePassword } from "./password";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function findUserById(id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function listInvites() {
  return db.select().from(invites).orderBy(sql`${invites.createdAt} desc`);
}

export async function createInvite(input: {
  email: string;
  actorId: string;
  ttlMs?: number;
}): Promise<{ token: string }> {
  const email = input.email.trim().toLowerCase();
  const token = randomBytes(32).toString("base64url"); // 43 chars
  await db.insert(invites).values({
    email,
    tokenHash: sha256(token),
    createdBy: input.actorId,
    expiresAt: new Date(Date.now() + (input.ttlMs ?? INVITE_TTL_MS)),
  });
  return { token };
}

export async function revokeInvite(id: string): Promise<void> {
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, id), isNull(invites.acceptedAt)));
}

export async function redeemInvite(input: {
  token: string;
  password: string;
  name: string;
}): Promise<{ userId: string }> {
  const check = validatePassword(input.password);
  if (!check.ok) throw new Error(check.reason);

  const tokenHash = sha256(input.token);

  return db.transaction(async (tx) => {
    // Find the invite row first (for the email), then atomically consume it.
    const found = await tx
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, tokenHash))
      .limit(1);
    const invite = found[0];
    if (!invite) throw new Error("This invite is no longer valid.");
    if (invite.revokedAt) throw new Error("This invite has been revoked.");
    if (invite.acceptedAt) throw new Error("This invite has already been used.");
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new Error("This invite has expired.");
    }

    // Atomic consume: only one concurrent redemption gets a row back.
    const consumed = await tx.execute(sql`
      update invites
      set accepted_at = now()
      where id = ${invite.id}
        and accepted_at is null
        and revoked_at is null
        and expires_at > now()
      returning id`);
    if (consumed.length === 0) {
      throw new Error("This invite has already been used.");
    }

    // Create the user directly (the signup gate's hasValidInvite check would
    // fail now that the invite is consumed, so insert + credential account
    // in the same transaction).
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(input.password);
    await tx.insert(users).values({
      id: userId,
      email: invite.email,
      name: input.name,
      emailVerified: true,
      role: "member",
      banned: false,
    });
    await tx.insert(accounts).values({
      id: crypto.randomUUID(),
      userId,
      providerId: "credential",
      accountId: userId, // better-auth matches accountId === user.id
      password: passwordHash,
    });
    await tx
      .update(invites)
      .set({ acceptedUserId: userId })
      .where(eq(invites.id, invite.id));

    return { userId };
  });
}
