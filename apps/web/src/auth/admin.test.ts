import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { users, sessions, adminActions } from "@spektrum/db/schema";
import { assertBanState } from "./ban-state";
import { banUser, suspendUser, unbanUser } from "./admin";
import { requireUserForToken } from "./session";

const run = Math.random().toString(36).slice(2, 10);
const ownerId = `owner-${run}`;
const victimId = `victim-${run}`;
const tempId = `temp-${run}`;

async function makeUser(id: string, email: string) {
  await db.insert(users).values({
    id,
    email,
    name: email,
    emailVerified: true,
    role: "member",
    banned: false,
  });
}

async function makeSession(userId: string) {
  const token = `tok-${userId}-${Math.random().toString(36).slice(2, 10)}`;
  await db.insert(sessions).values({
    id: `sess-${Math.random().toString(36).slice(2, 10)}`,
    token,
    userId,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  return token;
}

async function banColumnsOf(userId: string) {
  const rows = await db
    .select({ banned: users.banned, banExpires: users.banExpires })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]!;
}

async function findUserById(userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0];
}

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

beforeAll(async () => {
  await db.execute(
    sql`delete from users where id in (${ownerId}, ${victimId}, ${tempId})`,
  );
  await db.insert(users).values({
    id: ownerId,
    email: `admin-${run}@test.local`,
    name: "Admin",
    emailVerified: true,
    role: "owner",
    banned: false,
  });
  await makeUser(victimId, `victim-${run}@test.local`);
  await makeUser(tempId, `temp-${run}@test.local`);
});

afterAll(async () => {
  await db.execute(
    sql`delete from users where id in (${ownerId}, ${victimId}, ${tempId})`,
  );
  await pool.end();
});

describe("banUser", () => {
  it("permanently bans, revokes every live session, and writes an audit row", async () => {
    await makeSession(victimId);
    await makeSession(victimId);
    await banUser({ actorId: ownerId, userId: victimId, reason: "abuse" });

    const left = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, victimId));
    expect(left).toHaveLength(0);

    const u = await findUserById(victimId);
    expect(u?.banned).toBe(true);
    expect(u?.banExpires).toBeNull(); // permanent
    expect(u?.banReason).toBe("abuse");

    const audit = await db
      .select()
      .from(adminActions)
      .where(eq(adminActions.targetId, victimId));
    expect(audit.map((r) => r.action)).toContain("ban");
    expect(audit[0]?.actorId).toBe(ownerId);
    expect(audit[0]?.reason).toBe("abuse");
  });

  it("refuses to ban yourself", async () => {
    await expect(
      banUser({ actorId: ownerId, userId: ownerId, reason: "x" }),
    ).rejects.toThrow(/yourself/i);
  });
});

describe("banned cookie dies on the next request", () => {
  it("requireUserForToken rejects a banned user's token", async () => {
    const token = await makeSession(tempId);
    // sanity: token works while unbanned
    await expect(requireUserForToken(token)).resolves.toMatchObject({
      id: tempId,
    });
    await banUser({ actorId: ownerId, userId: tempId, reason: "abuse" });
    // sessions were revoked by the ban, so the token is gone entirely
    await expect(requireUserForToken(token)).rejects.toThrow(
      /unauthorized|forbidden|banned/i,
    );
  });
});

describe("suspendUser", () => {
  it("carries an expiry that lifts itself once elapsed", async () => {
    const uid = `susp-${run}`;
    await makeUser(uid, `susp-${run}@test.local`);
    // past expiry -> already lifted
    await suspendUser({
      actorId: ownerId,
      userId: uid,
      until: inHours(-1),
      reason: "spam",
    });
    expect(assertBanState(await banColumnsOf(uid), new Date())).toEqual({
      ok: true,
    });
    // future expiry -> still suspended
    await suspendUser({
      actorId: ownerId,
      userId: uid,
      until: inHours(1),
      reason: "spam",
    });
    const state = assertBanState(await banColumnsOf(uid), new Date());
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.reason).toBe("suspended");
    await db.execute(sql`delete from users where id = ${uid}`);
  });
});

describe("unbanUser", () => {
  it("clears the ban and writes an audit row", async () => {
    await unbanUser({ actorId: ownerId, userId: victimId });
    const u = await findUserById(victimId);
    expect(u?.banned).toBe(false);
    expect(u?.banExpires).toBeNull();
    expect(u?.banReason).toBeNull();
    const audit = await db
      .select()
      .from(adminActions)
      .where(eq(adminActions.targetId, victimId));
    expect(audit.map((r) => r.action)).toEqual(
      expect.arrayContaining(["ban", "unban"]),
    );
  });
});
