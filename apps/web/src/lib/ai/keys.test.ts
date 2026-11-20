import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import {
  deleteLlmKey,
  getLlmKeyStatus,
  saveLlmKey,
} from "@/auth/llm-key";
import { loadWebEnv } from "@spektrum/shared/env";
import { DEFAULT_PREFERENCES } from "@spektrum/shared";
import { putPreferences } from "@/lib/preferences";
import { resolveLlmConfigForRequest, resolveLlmKeyForRequest } from "./keys";

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
  await putPreferences(userId, DEFAULT_PREFERENCES);
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_BASE_URL;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

describe("resolveLlmConfigForRequest", () => {
  it("uses server env defaults until LLM settings are configured", async () => {
    await saveLlmKey(userId, USER_KEY);
    const env = loadWebEnv();
    expect(await resolveLlmConfigForRequest(userId, "member")).toEqual({
      key: USER_KEY,
      source: "user",
      baseUrl: env.llmBaseUrl,
      chatModel: env.llmModelChat,
      fastModel: env.llmModelFast,
    });
  });

  it("uses the chosen provider, endpoint and models once configured", async () => {
    await saveLlmKey(userId, USER_KEY);
    const llm = {
      configured: true,
      providerId: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      chatModel: "openai/gpt-4o",
      fastModel: "google/gemini-2.5-flash",
    };
    await putPreferences(userId, { ...DEFAULT_PREFERENCES, llm });
    expect(await resolveLlmConfigForRequest(userId, "member")).toEqual({
      key: USER_KEY,
      source: "user",
      baseUrl: llm.baseUrl,
      chatModel: llm.chatModel,
      fastModel: llm.fastModel,
    });
  });

  it("uses the provider's catalog endpoint when the stored one is blank", async () => {
    await saveLlmKey(userId, USER_KEY);
    await putPreferences(userId, {
      ...DEFAULT_PREFERENCES,
      llm: {
        configured: true,
        providerId: "kilo",
        baseUrl: "",
        chatModel: "baidu/ernie-5.5-flash-preview:free",
        fastModel: "baidu/ernie-5.5-flash-preview:free",
      },
    });
    const config = await resolveLlmConfigForRequest(userId, "member");
    expect(config?.baseUrl).toBe("https://api.kilo.ai/api/gateway");
    expect(config?.chatModel).toBe("baidu/ernie-5.5-flash-preview:free");
  });

  it("ignores an invalid stored endpoint", async () => {
    await saveLlmKey(userId, USER_KEY);
    await putPreferences(userId, {
      ...DEFAULT_PREFERENCES,
      llm: {
        configured: true,
        providerId: "custom",
        baseUrl: "ftp://bad.example/v1",
        chatModel: "m",
        fastModel: "f",
      },
    });
    const env = loadWebEnv();
    const config = await resolveLlmConfigForRequest(userId, "member");
    expect(config?.baseUrl).toBe(env.llmBaseUrl);
  });

  it("keeps a server key on the env gateway, not the catalog provider", async () => {
    process.env.LLM_API_KEY = SERVER_KEY;
    process.env.LLM_BASE_URL = "https://env-only.example/v1";
    await putPreferences(userId, {
      ...DEFAULT_PREFERENCES,
      llm: {
        configured: true,
        providerId: "kilo",
        baseUrl: "https://custom.example/v1",
        chatModel: "chat",
        fastModel: "fast",
      },
    });
    const env = loadWebEnv();
    const config = await resolveLlmConfigForRequest(userId, "owner");
    expect(config?.source).toBe("server");
    expect(config?.baseUrl).toBe(env.llmBaseUrl);
    expect(config?.chatModel).toBe(env.llmModelChat);
  });

  it("returns null without a key", async () => {
    expect(await resolveLlmConfigForRequest(userId, "member")).toBeNull();
  });
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