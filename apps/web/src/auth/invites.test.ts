import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import {
  createInvite,
  findUserById,
  listInvites,
  redeemInvite,
} from "./invites";

const ownerId = "11111111-1111-1111-1111-111111111111";

beforeAll(async () => {
  await db.execute(sql`
    insert into users (id,email,name,email_verified,role,banned)
    values (${ownerId},'invite-owner@test.local','O',true,'owner',false)
    on conflict (id) do nothing`);
  await db.execute(sql`delete from users where email like '%@invite.test'`);
  await db.execute(sql`delete from invites where email like '%@invite.test'`);
});

afterAll(async () => {
  await db.execute(sql`delete from users where email like '%@invite.test'`);
  await db.execute(sql`delete from invites where email like '%@invite.test'`);
  await db.execute(sql`delete from users where id = ${ownerId}`);
  await pool.end();
});

describe("createInvite", () => {
  it("creates an invite bound to a normalised email", async () => {
    const { token } = await createInvite({
      email: "  New.User@Invite.Test ",
      actorId: ownerId,
    });
    const rows = await listInvites();
    const row = rows.find((r) => r.email === "new.user@invite.test");
    expect(row).toBeDefined();
    expect(token).toHaveLength(43); // 32 random bytes, base64url
  });

  it("stores only a hash of the token", async () => {
    const { token } = await createInvite({
      email: "hash@invite.test",
      actorId: ownerId,
    });
    const raw = await db.execute(sql`
      select token_hash from invites where email='hash@invite.test'`);
    expect((raw as unknown as { token_hash: string }[])[0]!.token_hash).not.toBe(
      token,
    );
  });

  it("refuses to invite an email that already has an account", async () => {
    await db.execute(sql`
      insert into users (id,email,name,email_verified,role,banned)
      values ('22222222-2222-2222-2222-222222222222','exists@invite.test','E',true,'member',false)
      on conflict (id) do nothing`);
    await expect(
      createInvite({ email: "Exists@Invite.Test", actorId: ownerId }),
    ).rejects.toThrow(/already exists/i);
  });
});

describe("redeemInvite", () => {
  it("redeems once and creates a member", async () => {
    const { token } = await createInvite({
      email: "c@invite.test",
      actorId: ownerId,
    });
    const { userId } = await redeemInvite({
      token,
      password: "a long enough password",
      name: "C",
    });
    const u = await findUserById(userId);
    expect(u?.role).toBe("member");
    expect(u?.banned).toBe(false);
    await expect(
      redeemInvite({
        token,
        password: "another long password",
        name: "C",
      }),
    ).rejects.toThrow(/already been used|no longer valid/i);
  });

  it("rejects an expired invite", async () => {
    const { token } = await createInvite({
      email: "late@invite.test",
      actorId: ownerId,
      ttlMs: -1000,
    });
    await expect(
      redeemInvite({ token, password: "a long enough password", name: "L" }),
    ).rejects.toThrow(/expired|no longer valid/i);
  });
});
