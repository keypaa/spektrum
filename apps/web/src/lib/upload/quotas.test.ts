// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { BUDGETS, closeRateLimiter } from "@spektrum/shared/rate-limit";
import {
  consumeStorageQuota,
  DAILY_STORAGE_BYTES,
  MAX_UPLOAD_BYTES,
} from "./quotas";

afterAll(async () => {
  await closeRateLimiter();
});

describe("upload caps", () => {
  it("caps each upload kind at its exact per-kind ceiling", () => {
    expect(MAX_UPLOAD_BYTES).toEqual({
      import: 26 * 1024 * 1024,
      workspace: 30 * 1024 * 1024,
      "chat-image": 1 * 1024 * 1024,
      render: 20 * 1024 * 1024,
    });
  });
});

describe("daily byte budget", () => {
  it("allows 256 MiB per user per UTC day", () => {
    expect(DAILY_STORAGE_BYTES).toBe(256 * 1024 * 1024);
  });
});

describe("consumeStorageQuota", () => {
  it("allows a call that fills the daily byte budget but blocks the next one", async () => {
    const userId = `quota-${randomUUID()}`;
    expect(await consumeStorageQuota(userId, DAILY_STORAGE_BYTES)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    // This second call pushes the user above the daily byte budget: the coarse
    // daily token bucket must lock them out until the next day.
    const blocked = await consumeStorageQuota(userId, 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows several small uploads within the daily byte budget", async () => {
    const userId = `quota-${randomUUID()}`;
    for (let i = 0; i < 3; i += 1) {
      expect(
        (await consumeStorageQuota(userId, 1024 * 1024)).allowed,
        `upload ${i + 1}`,
      ).toBe(true);
    }
  });

  it("keeps different users' byte counters separate", async () => {
    const a = `quota-${randomUUID()}`;
    const b = `quota-${randomUUID()}`;
    expect((await consumeStorageQuota(a, DAILY_STORAGE_BYTES)).allowed).toBe(true);
    expect((await consumeStorageQuota(b, 1024)).allowed).toBe(true);
  });

  it("rejects a non-integral or negative byte count", async () => {
    const userId = `quota-${randomUUID()}`;
    await expect(consumeStorageQuota(userId, -1)).rejects.toThrow();
    await expect(consumeStorageQuota(userId, 1.5)).rejects.toThrow();
  });
});

describe("free-tier budgets", () => {
  it("adds the signup and coarse daily storage budgets", () => {
    expect(BUDGETS.signup).toEqual({ limit: 3, windowMs: 15 * 60_000 });
    expect(BUDGETS.storageDay).toEqual({ limit: 1, windowMs: 24 * 60 * 60_000 });
  });
});
