import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import {
  deleteLlmKey,
  getLlmKeyStatus,
  saveLlmKey,
} from "@/auth/llm-key";
import { resolveLlmKeyForRequest } from "./keys";

const run = Math.random().toString(36).slice(2, 10);
const userId = `keys-${run}`;
const email = `keys-${run}@test.local`;
const USER_KEY = "sk-user-abcdefghijklmnopqrstuvwxyz";
const SERVER_KEY = "sk-server-abcdefghijklmnopqrstuvwxyz";

beforeAll(async () => {
  await db.execute(sql`delete from users where id = ${userId}`);
  await db.insert(users).values({ id: userId, email, name: "K" });
});

afterEach(async () => {
  await deleteLlmKey(userId);
  delete process.env.LLM_API_KEY;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

describe("resolveLlmKeyForRequest", () => {
  it("prefers the user's key", async () => {
    await saveLlmKey(userId, USER_KEY);
    expect(await resolveLlmKeyForRequest(userId, "member")).toEqual({
      key: USER_KEY,
      source: "user",
    });
  });

  it("returns null for a member without a key even when a server key exists", async () => {
    process.env.LLM_API_KEY = SERVER_KEY;
    expect(await resolveLlmKeyForRequest(userId, "member")).toBeNull();
  });

  it("uses the server key only for an owner", async () => {
    process.env.LLM_API_KEY = SERVER_KEY;
    expect(await resolveLlmKeyForRequest(userId, "owner")).toEqual({
      key: SERVER_KEY,
      source: "server",
    });
  });

  it("never returns the plaintext through the status helper", async () => {
    await saveLlmKey(userId, USER_KEY);
    const status = await getLlmKeyStatus(userId);
    expect(status).toEqual({ configured: true, last4: USER_KEY.slice(-4) });
    expect(JSON.stringify(status)).not.toContain(USER_KEY);
  });
});