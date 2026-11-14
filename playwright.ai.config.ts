import { defineConfig } from "@playwright/test";

// The AI e2e is a separate config: it needs the mock gateway (port 4010) and a
// Next server started with LLM_BASE_URL pointed at it. The default e2e job must
// never pick it up.
const BASE_ENV = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgres://spektrum:spektrum@localhost:5432/spektrum_test",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? "e2e-secret-32-chars-minimum!!!!!",
  BETTER_AUTH_URL: "http://localhost:3000",
  LLM_KEY_ENCRYPTION_SECRET:
    process.env.LLM_KEY_ENCRYPTION_SECRET ?? "e2e-key-encryption-secret-32ch!x",
  LLM_BASE_URL: "http://localhost:4010/v1",
  LLM_API_KEY: "test-key",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: /ai\.spec\.ts/,
  testIgnore: ["**/visual/**"],
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: {
      "x-forwarded-for": `10.69.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
  },
  globalSetup: "./e2e/ai.global-setup.ts",
  webServer: [
    {
      command: process.env.E2E_WEB_COMMAND ?? "pnpm --filter @spektrum/web dev",
      url: "http://localhost:3000/login",
      reuseExistingServer: false,
      timeout: process.env.E2E_WEB_COMMAND ? 120_000 : 60_000,
      env: BASE_ENV,
    },
    {
      command: "pnpm --filter @spektrum/web exec tsx ../../e2e/ai-gateway.ts",
      url: "http://localhost:4010/health",
      reuseExistingServer: false,
      timeout: 30_000,
      env: BASE_ENV,
    },
  ],
});