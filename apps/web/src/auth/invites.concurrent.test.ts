import { afterAll, beforeAll, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { createInvite, redeemInvite } from "./invites";

const ownerId = "22222222-2222-2222-2222-222222222222";

beforeAll(async () => {
  await db.execute(sql`
    insert into users (id,email,name,email_verified,role,banned)
    values (${ownerId},'race-owner@test.local','O',true,'owner',false)
    on conflict (id) do nothing`);
});

afterAll(async () => {
  await db.execute(sql`delete from users where email like 'race%@invite.test'`);
  await db.execute(sql`delete from invites where email like 'race%@invite.test'`);
  await db.execute(sql`delete from users where id = ${ownerId}`);
  await pool.end();
});

it("allows exactly one of two concurrent redemptions", async () => {
  const { token } = await createInvite({
    email: "race@invite.test",
    actorId: ownerId,
  });
  const results = await Promise.allSettled([
    redeemInvite({ token, password: "a long enough password", name: "A" }),
    redeemInvite({ token, password: "a long enough password", name: "B" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const count = await db.execute(sql`
    select count(*)::int as c from users where email='race@invite.test'`);
  expect((count as unknown as { c: number }[])[0]!.c).toBe(1);
});
