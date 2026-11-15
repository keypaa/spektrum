import { defineConfig } from "@playwright/test";

// The compile e2e is a separate config: it needs the worker, MinIO, Redis and
// the texlive image, so it must never run in the default (blocking) e2e job.
const env = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgres://spektrum:spektrum@localhost:5432/spektrum_test",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? "e2e-secret-32-chars-minimum!!!!!",
  BETTER_AUTH_URL: "http://localhost:3000",
  LLM_KEY_ENCRYPTION_SECRET:
    process.env.LLM_KEY_ENCRYPTION_SECRET ?? "e2e-key-encryption-secret-32ch!x",
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  S3_BUCKET: process.env.S3_BUCKET ?? "spektrum-uploads",
  S3_PDF_BUCKET: process.env.S3_PDF_BUCKET ?? "spektrum-pdf",
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? "spektrum",
  S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? "spektrum-secret",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: /compile\.spec\.ts/,
  testIgnore: "**/visual/**",
  globalSetup: "./e2e/compile.global-setup.ts",
  timeout: 120_000,
  // Compile timing depends on a warm worker and container; one retry absorbs a
  // cold start on a shared runner without hiding a real regression.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: {
      "x-forwarded-for": `10.68.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
  },
  webServer: {
    command:
      "sh -c 'pnpm --filter @spektrum/web build && pnpm --filter @spektrum/web exec next start -p 3000'",
    url: "http://localhost:3000/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env,
  },
});