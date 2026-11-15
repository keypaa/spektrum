// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWebEnv } from "@spektrum/shared/env";

const examplePath = resolve(import.meta.dirname, "../../../../.env.example");

const exampleKeys = (): Set<string> =>
  new Set(
    readFileSync(examplePath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"))
      .map((line) => line.split("=")[0]!.trim()),
  );

const base: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://spektrum:spektrum@localhost:5432/spektrum",
  REDIS_URL: "redis://localhost:6379",
  BETTER_AUTH_SECRET: "test-secret-32-chars-minimum!!!!!!",
  BETTER_AUTH_URL: "http://localhost:3000",
  LLM_KEY_ENCRYPTION_SECRET: "test-key-encryption-secret-32ch!",
};

describe("environment contract", () => {
  it("documents every production key in .env.example", () => {
    const keys = exampleKeys();
    const required = [
      "PUBLIC_URL",
      "ACME_EMAIL",
      "S3_ENDPOINT",
      "S3_BUCKET",
      "S3_PDF_BUCKET",
      "IMPORT_MAX_FILE_BYTES",
      "IMPORT_MAX_TOTAL_BYTES",
      "IMPORT_MAX_ENTRIES",
      "IMPORT_MAX_RATIO",
      "IMPORT_MAX_PROJECTS",
      "TEXLIVE_IMAGE",
      "HEALTH_PORT",
      "METRICS_TOKEN",
      "SENTRY_DSN",
    ];
    const missing = required.filter((name) => !keys.has(name));
    expect(missing).toEqual([]);
  });

  it("exposes the import limits, with defaults and overrides", () => {
    const defaults = loadWebEnv(base);
    expect(defaults.importMaxFileBytes).toBe(26_214_400);
    expect(defaults.importMaxTotalBytes).toBe(536_870_912);
    expect(defaults.importMaxEntries).toBe(50_000);
    expect(defaults.importMaxRatio).toBe(100);
    expect(defaults.importMaxProjects).toBe(200);
    expect(defaults.sentryDsn).toBeUndefined();

    const overridden = loadWebEnv({
      ...base,
      IMPORT_MAX_FILE_BYTES: "1048576",
      IMPORT_MAX_ENTRIES: "10",
      SENTRY_DSN: "https://key@example.ingest.sentry.io/1",
    });
    expect(overridden.importMaxFileBytes).toBe(1_048_576);
    expect(overridden.importMaxEntries).toBe(10);
    expect(overridden.sentryDsn).toBe("https://key@example.ingest.sentry.io/1");
  });

  it("rejects a non-numeric or negative import limit", () => {
    expect(() => loadWebEnv({ ...base, IMPORT_MAX_ENTRIES: "many" })).toThrow();
    expect(() => loadWebEnv({ ...base, IMPORT_MAX_RATIO: "-1" })).toThrow();
  });
});