import { describe, expect, it } from "vitest";
import { loadWebEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://spektrum:spektrum@localhost:5432/spektrum",
  REDIS_URL: "redis://localhost:6379",
  BETTER_AUTH_SECRET: "x".repeat(64),
  BETTER_AUTH_URL: "http://localhost:3000",
  LLM_KEY_ENCRYPTION_SECRET: "y".repeat(32),
};

// Serverless Vercel env: no TCP URL, Upstash REST instead.
const restOnly = {
  DATABASE_URL: base.DATABASE_URL,
  BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: base.BETTER_AUTH_URL,
  LLM_KEY_ENCRYPTION_SECRET: base.LLM_KEY_ENCRYPTION_SECRET,
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "rest-token",
};

describe("loadWebEnv", () => {
  it("accepts a minimal valid environment", () => {
    const env = loadWebEnv(base);
    expect(env.allowPublicSignup).toBe(false);
    expect(env.authUrl).toBe("http://localhost:3000");
  });

  // Either transport is valid; getRedis() still prefers REDIS_URL when both
  // are present (VPS/dev behaviour must stay byte-for-byte unchanged).
  it("accepts REDIS_URL alone and keeps the TCP URL verbatim", () => {
    const env = loadWebEnv(base);
    expect(env.redisUrl).toBe("redis://localhost:6379");
    expect(env.upstashRedisRestUrl).toBeUndefined();
    expect(env.upstashRedisRestToken).toBeUndefined();
  });

  it("accepts Upstash REST vars alone with an empty redisUrl", () => {
    const env = loadWebEnv(restOnly);
    expect(env.redisUrl).toBe("");
    expect(env.upstashRedisRestUrl).toBe("https://example.upstash.io");
    expect(env.upstashRedisRestToken).toBe("rest-token");
  });

  it("rejects an environment with no Redis configuration", () => {
    const { REDIS_URL: _tcp, ...noRedis } = base;
    expect(() => loadWebEnv(noRedis)).toThrow(
      /REDIS_URL.*UPSTASH_REDIS_REST_URL.*UPSTASH_REDIS_REST_TOKEN/,
    );
  });

  it("rejects incomplete Upstash REST configuration", () => {
    expect(() =>
      loadWebEnv({ ...restOnly, UPSTASH_REDIS_REST_TOKEN: undefined }),
    ).toThrow(/UPSTASH_REDIS_REST_TOKEN/);
  });

  it("keeps REDIS_URL as the configured URL when both transports are set", () => {
    expect(loadWebEnv({ ...base, ...restOnly }).redisUrl).toBe(
      "redis://localhost:6379",
    );
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

  // The shared-code default guards `main`: the serverless branch opens signup
  // only with a Vercel deployment env var, never by changing this default.
  it("keeps public signup closed unless a deployment explicitly opts in", () => {
    expect(loadWebEnv(base).allowPublicSignup).toBe(false);
    expect(loadWebEnv({ ...base, ALLOW_PUBLIC_SIGNUP: "false" }).allowPublicSignup).toBe(false);
    expect(loadWebEnv({ ...base, ALLOW_PUBLIC_SIGNUP: "TRUE" }).allowPublicSignup).toBe(false);
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