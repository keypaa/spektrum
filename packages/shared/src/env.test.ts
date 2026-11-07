import { describe, expect, it } from "vitest";
import { loadWebEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://spektrum:spektrum@localhost:5432/spektrum",
  REDIS_URL: "redis://localhost:6379",
  BETTER_AUTH_SECRET: "x".repeat(64),
  BETTER_AUTH_URL: "http://localhost:3000",
  LLM_KEY_ENCRYPTION_SECRET: "y".repeat(32),
};

describe("loadWebEnv", () => {
  it("accepts a minimal valid environment", () => {
    const env = loadWebEnv(base);
    expect(env.allowPublicSignup).toBe(false);
    expect(env.authUrl).toBe("http://localhost:3000");
  });

  it("rejects a BETTER_AUTH_SECRET shorter than 32 chars", () => {
    expect(() => loadWebEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("reports every problem at once", () => {
    try {
      loadWebEnv({});
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("DATABASE_URL");
      expect(msg).toContain("BETTER_AUTH_SECRET");
      expect(msg).toContain("LLM_KEY_ENCRYPTION_SECRET");
    }
  });

  it("treats only the literal string \"true\" as true", () => {
    expect(loadWebEnv({ ...base, ALLOW_PUBLIC_SIGNUP: "1" }).allowPublicSignup).toBe(false);
    expect(loadWebEnv({ ...base, ALLOW_PUBLIC_SIGNUP: "true" }).allowPublicSignup).toBe(true);
  });
});