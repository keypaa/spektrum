import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import {
  saveLlmKey,
  getLlmKeyStatus,
  deleteLlmKey,
  resolveLlmKey,
  validateApiKeyShape,
} from "./llm-key";

const run = Math.random().toString(36).slice(2, 10);
const userId = `llm-${run}`;
const API_KEY = "sk-test-abcdefghijklmnopqrstuvwxyz0123";

beforeAll(async () => {
  await db.execute(sql`delete from users where id = ${userId}`);
  await db.insert(users).values({
    id: userId,
    email: `llm-${run}@test.local`,
    name: "L",
    emailVerified: true,
    role: "member",
    banned: false,
  });
});

afterAll(async () => {
  await db.execute(sql`delete from users where id = ${userId}`);
  await pool.end();
});

describe("validateApiKeyShape", () => {
  it("accepts a plausible key", () => {
    expect(validateApiKeyShape(API_KEY)).toEqual({ ok: true });
  });

  it("accepts long JWT-style provider keys", () => {
    // Kilo Code gateway keys are JWTs — several hundred characters, not the
    // short `sk-…` tokens this validator was originally written for.
    const jwt = `kc.${"Abc012-_xYz".repeat(100)}`;
    expect(jwt.length).toBeGreaterThan(1000);
    expect(validateApiKeyShape(jwt)).toEqual({ ok: true });
  });

  it("rejects bad shapes", () => {
    expect(validateApiKeyShape("short").ok).toBe(false);
    expect(validateApiKeyShape("x".repeat(4097)).ok).toBe(false);
    expect(validateApiKeyShape("has spaces in it..............").ok).toBe(false);
  });
});

describe("llm key storage", () => {
  it("GET status is { configured: false } before any key is stored", async () => {
    expect(await getLlmKeyStatus(userId)).toEqual({ configured: false });
  });

  it("stores ciphertext + last4 and never returns the plaintext", async () => {
    await saveLlmKey(userId, API_KEY);
    const status = await getLlmKeyStatus(userId);
    expect(status).toEqual({ configured: true, last4: "0123" });
    expect(JSON.stringify(status)).not.toContain("sk-test");

    const row = await db
      .select({
        ct: users.llmApiKeyCiphertext,
        l4: users.llmApiKeyLast4,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    expect(row[0]!.ct).not.toContain("sk-test");
    expect(row[0]!.ct).not.toBe(API_KEY);
    expect(row[0]!.l4).toBe("0123");
  });

  it("resolveLlmKey decrypts with the user id as AAD (server-side only)", async () => {
    expect(await resolveLlmKey(userId)).toBe(API_KEY);
  });

  it("replacing the key overwrites both columns", async () => {
    const second = "sk-test-ZZZZZZZZZZZZZZZZZZZZZZZZZZ99";
    await saveLlmKey(userId, second);
    expect(await getLlmKeyStatus(userId)).toEqual({
      configured: true,
      last4: "ZZ99",
    });
    expect(await resolveLlmKey(userId)).toBe(second);
  });

  it("round-trips a long JWT-style key without truncation", async () => {
    const jwt = `kc.${"Abc012-_xYz".repeat(100)}`;
    await saveLlmKey(userId, jwt);
    expect(await resolveLlmKey(userId)).toBe(jwt);
    const status = await getLlmKeyStatus(userId);
    expect(status.configured).toBe(true);
    expect(status.last4).toBe(jwt.slice(-4));
  });

  it("DELETE nulls both columns immediately", async () => {
    await deleteLlmKey(userId);
    expect(await getLlmKeyStatus(userId)).toEqual({ configured: false });
    expect(await resolveLlmKey(userId)).toBeNull();
    const row = await db
      .select({ ct: users.llmApiKeyCiphertext, l4: users.llmApiKeyLast4 })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    expect(row[0]!.ct).toBeNull();
    expect(row[0]!.l4).toBeNull();
  });

  it("rejects a bad key shape without touching the DB", async () => {
    await expect(saveLlmKey(userId, "nope")).rejects.toThrow(/key/i);
    expect(await getLlmKeyStatus(userId)).toEqual({ configured: false });
  });
});
