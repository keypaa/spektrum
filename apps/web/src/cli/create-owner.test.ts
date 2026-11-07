import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { createOwner, findUserById, findCredentialAccount } from "./create-owner";

beforeAll(async () => {
  // This runs on the dedicated unit DB (spektrum_unit): clear any owner left
  // by another test file in the same single fork, plus our own fixtures.
  await db.execute(sql`delete from users where role = 'owner'`);
  await db.execute(
    sql`delete from users where email in ('owner@test.local','second@test.local','weak@test.local')`,
  );
});

afterAll(async () => {
  await db.execute(sql`delete from users where role = 'owner'`);
  await db.execute(
    sql`delete from users where email in ('owner@test.local','second@test.local','weak@test.local')`,
  );
  await pool.end();
});

describe("createOwner", () => {
  it("creates the first owner with an argon2id-hashed credential password", async () => {
    const { id } = await createOwner({
      email: "owner@test.local",
      password: "a long enough password",
      name: "Owner",
    });
    const row = await findUserById(id);
    expect(row?.role).toBe("owner");
    expect(row?.emailVerified).toBe(true);
    const acct = await findCredentialAccount(id);
    expect(acct?.password).toMatch(/^\$argon2id\$/);
  });

  it("refuses a second owner", async () => {
    await expect(
      createOwner({
        email: "second@test.local",
        password: "another long password",
        name: "X",
      }),
    ).rejects.toThrow(/owner already exists/i);
  });

  it("refuses a weak password", async () => {
    await db.execute(sql`delete from users where role = 'owner'`);
    await expect(
      createOwner({
        email: "weak@test.local",
        password: "short",
        name: "X",
      }),
    ).rejects.toThrow(/at least 12/i);
  });
});
