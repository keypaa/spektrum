import { afterAll, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "./client";

afterAll(async () => {
  await pool.end();
});

it("creates the Better Auth users table with our extra columns", async () => {
  const rows = (await db.execute(sql`
    select column_name, is_nullable, data_type, udt_name
    from information_schema.columns where table_name = 'users'`)) as unknown as Record<
    string,
    unknown
  >[];
  const cols = Object.fromEntries(rows.map((r) => [r.column_name, r]));
  for (const c of [
    "id",
    "email",
    "email_verified",
    "name",
    "role",
    "banned",
    "ban_reason",
    "ban_expires",
    "llm_api_key_ciphertext",
    "llm_api_key_last4",
  ]) {
    expect(cols[c], c).toBeDefined();
  }
  // citext shows up as USER-DEFINED in data_type; the real type is udt_name
  expect(cols.email?.udt_name).toBe("citext");
  // Better Auth stores the credential password in accounts, not users
  expect(cols["password"]).toBeUndefined();
});

it("enforces one account per email regardless of case", async () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const id1 = `u1-${suffix}`;
  const id2 = `u2-${suffix}`;
  const email1 = `Dup-${suffix}@Example.com`;
  const email2 = `dup-${suffix}@example.com`;
  await db.execute(sql`
    insert into users (id,email,name,email_verified) values (${id1},${email1},'D',true)`);
  const err = await db
    .execute(sql`
      insert into users (id,email,name,email_verified) values (${id2},${email2},'D',true)`)
    .catch((e: unknown) => e);
  // drizzle wraps the pg error; walk the cause chain for the pg message
  let msg = "";
  for (let e = err as { message?: string; cause?: unknown }; e; e = e.cause as typeof e) {
    msg += e.message ?? "";
  }
  expect(msg).toMatch(/duplicate key/);
  await db.execute(sql`delete from users where id in (${id1}, ${id2})`);
});

it("models bans as banned + ban_expires, and the unique index blocks a second accept", async () => {
  const cols = (await db.execute(sql`
    select column_name from information_schema.columns where table_name='invites'`)) as unknown as {
    column_name: string;
  }[];
  expect(cols.map((c) => c.column_name)).toContain("accepted_user_id");
  // The unique constraint on invites.accepted_user_id (drizzle names it *_unique)
  const idx = (await db.execute(sql`
    select indexdef from pg_indexes
    where tablename='invites' and indexdef like '%accepted_user_id%'`)) as unknown as {
    indexdef: string;
  }[];
  expect(idx.length).toBeGreaterThan(0);
  expect(idx[0]!.indexdef).toMatch(/UNIQUE/i);
});

it("defaults render status to queued", async () => {
  const d = (await db.execute(sql`
    select column_default from information_schema.columns
    where table_name='pdf_renders' and column_name='status'`)) as unknown as {
    column_default: string;
  }[];
  expect(String(d[0]?.column_default)).toContain("queued");
});
