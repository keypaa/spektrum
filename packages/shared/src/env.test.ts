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

  // `env_file: .env` in docker/compose.prod.yml passes `KEY=` through as an
  // empty string, not as an unset variable. Treating that as a value would make
  // loadWebEnv throw, and every mutating route answers 500 while /api/health
  // (which never calls loadWebEnv) still says "ok". S3 settings have storage
  // defaults, so an empty S3_ACCESS_KEY falls back to "spektrum".
  it("treats an empty value as unset for the optional keys", () => {
    const env = loadWebEnv({
      ...base,
      METRICS_TOKEN: "",
      SENTRY_DSN: "",
      S3_ACCESS_KEY: "",
      LLM_API_KEY: "",
    });
    expect(env.metricsToken).toBeUndefined();
    expect(env.sentryDsn).toBeUndefined();
    expect(env.s3AccessKey).toBe("spektrum");
    expect(env.llmApiKey).toBeUndefined();
  });

  it("still rejects a non-empty but invalid optional value", () => {
    expect(() => loadWebEnv({ ...base, SENTRY_DSN: "not-a-url" })).toThrow(/SENTRY_DSN/);
  });
});