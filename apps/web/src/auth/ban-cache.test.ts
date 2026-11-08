import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { auth } from "./auth";
import { banUser } from "./admin";
import { hashPassword } from "./password";

// Regression test for the audit's critical finding: banning a user must kill
// the Redis-cached session too, not just the DB row. Drives the real Better
// Auth handler in-process, so the session lives in secondary storage exactly
// like production.
const run = Math.random().toString(36).slice(2, 10);
const email = `ban-cache-${run}@test.local`;
const password = "ban cache test password";
const userId = `bancache-${run}`;
const ownerId = `bancache-owner-${run}`;
const ip = `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

beforeAll(async () => {
  await db.execute(sql`delete from users where id in (${userId}, ${ownerId})`);
  await db.execute(sql`
    insert into users (id,email,name,email_verified,role,banned)
    values (${ownerId}, ${`bancache-owner-${run}@test.local`}, 'O', true, 'owner', false)`);
  await db.execute(sql`
    insert into users (id,email,name,email_verified,role,banned)
    values (${userId}, ${email}, 'V', true, 'member', false)`);
  await db.execute(sql`
    insert into accounts (id,user_id,provider_id,account_id,password)
    values (${`acct-${run}`}, ${userId}, 'credential', ${userId}, ${await hashPassword(password)})`);
});

afterAll(async () => {
  await db.execute(sql`delete from users where id in (${userId}, ${ownerId})`);
  await pool.end();
});

function post(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-forwarded-for": ip,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("ban kills the cached session on the next request", () => {
  it("get-session returns null after banUser", async () => {
    const signIn = await auth.handler(
      post("/api/auth/sign-in/email", { email, password }),
    );
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.get("set-cookie")!.split(";")[0]!;

    const before = await auth.handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { cookie },
      }),
    );
    expect(before.status).toBe(200);
    expect(await before.json()).not.toBeNull();

    await banUser({ actorId: ownerId, userId, reason: "regression test" });

    const after = await auth.handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { cookie },
      }),
    );
    // the pre-ban cookie is dead: no session comes back
    expect(await after.json()).toBeNull();
  });
});
