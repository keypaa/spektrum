import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { consume, BUDGETS, closeRateLimiter } from "./rate-limit";

describe("BUDGETS (spec §10.5)", () => {
  it("defines the spec's budgets", () => {
    expect(BUDGETS.signIn).toEqual({ limit: 5, windowMs: 15 * 60_000 });
    expect(BUDGETS.compile).toEqual({ limit: 6, windowMs: 60_000, burst: 12 });
    expect(BUDGETS.ai).toEqual({ limit: 30, windowMs: 60_000 });
    expect(BUDGETS.upload).toEqual({ limit: 20, windowMs: 60_000 });
  });
});

describe("consume", () => {
  it("allows up to the limit then blocks with a retry hint", async () => {
    const k = `t:${randomUUID()}`;
    for (let i = 0; i < 5; i++) {
      const r = await consume(k, BUDGETS.signIn);
      expect(r.allowed, `attempt ${i + 1}`).toBe(true);
    }
    const blocked = await consume(k, BUDGETS.signIn);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(15 * 60_000);
  });

  it("burst allows more than the sustained limit in one window", async () => {
    const k = `t:${randomUUID()}`;
    // compile: 6/min sustained, burst 12 — a fresh key can fire 12 at once
    for (let i = 0; i < 12; i++) {
      expect((await consume(k, BUDGETS.compile)).allowed).toBe(true);
    }
    expect((await consume(k, BUDGETS.compile)).allowed).toBe(false);
  });

  it("keys are independent", async () => {
    const a = `t:${randomUUID()}`;
    const b = `t:${randomUUID()}`;
    for (let i = 0; i < 5; i++) await consume(a, BUDGETS.signIn);
    expect((await consume(a, BUDGETS.signIn)).allowed).toBe(false);
    expect((await consume(b, BUDGETS.signIn)).allowed).toBe(true);
  });

  it("recovers after the window refills (short window)", async () => {
    const k = `t:${randomUUID()}`;
    const tiny = { limit: 1, windowMs: 200 };
    expect((await consume(k, tiny)).allowed).toBe(true);
    expect((await consume(k, tiny)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 250));
    expect((await consume(k, tiny)).allowed).toBe(true);
  }, 10_000);

  it("closeRateLimiter is callable for cleanup", async () => {
    await closeRateLimiter();
  });
});
