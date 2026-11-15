// @vitest-environment node
import { describe, expect, it } from "vitest";
import { limitsFromEnv } from "./limits";

const base: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://spektrum:spektrum@localhost:5432/spektrum_unit",
  REDIS_URL: "redis://localhost:6379",
  BETTER_AUTH_SECRET: "test-secret-32-chars-minimum!!!!!!",
  BETTER_AUTH_URL: "http://localhost:3000",
  LLM_KEY_ENCRYPTION_SECRET: "test-key-encryption-secret-32ch!",
};

describe("limitsFromEnv", () => {
  it("exposes every import cap, including the ratio", () => {
    const limits = limitsFromEnv(base);
    expect(limits.maxFileBytes).toBe(26_214_400);
    expect(limits.maxTotalBytes).toBe(536_870_912);
    expect(limits.maxEntries).toBe(50_000);
    expect(limits.maxProjects).toBe(200);
    // The ratio used to be hard-coded in the importer, so an operator's
    // IMPORT_MAX_RATIO was accepted by the schema and then ignored.
    expect(limits.maxRatio).toBe(100);
  });

  it("honours overrides", () => {
    const limits = limitsFromEnv({
      ...base,
      IMPORT_MAX_FILE_BYTES: "1048576",
      IMPORT_MAX_RATIO: "5",
    });
    expect(limits.maxFileBytes).toBe(1_048_576);
    expect(limits.maxRatio).toBe(5);
  });
});