import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // The visual suite has its own config (playwright.visual.config.ts) and its
  // own two-server setup; the behavioural suite must never pick it up.
  testIgnore: ["**/visual/**", "**/compile.spec.ts", "**/ai.spec.ts"],
  // `next dev` compiles each route on demand. A route the suite has not hit
  // yet (or whose cache was evicted) can take longer than 30 s to compile on a
  // loaded machine, which surfaced as a click timeout rather than a real
  // failure. Assertions still report their own reason.
  timeout: 60_000,
  // Assertions default to 5 s, which is tight on a cold CI runner compiling
  // routes on demand. A test still fails for its own reason, not on the clock.
  expect: { timeout: 15_000 },
  // Every spec drives the same owner account and database; parallel workers
  // race on project counts and the sign-in rate limit. The suite is small
  // enough to run serially.
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // Fresh source IP per run so the sign-in rate limit (5 / 15 min / IP,
    // spec §10.5) never accumulates across repeated e2e runs.
    extraHTTPHeaders: {
      "x-forwarded-for": `10.66.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
  },
  webServer: {
    command:
      process.env.E2E_WEB_COMMAND ?? "pnpm --filter @spektrum/web dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://spektrum:spektrum@localhost:5432/spektrum_test",
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? "e2e-secret-32-chars-minimum!!!!!",
      BETTER_AUTH_URL: "http://localhost:3000",
      LLM_KEY_ENCRYPTION_SECRET:
        process.env.LLM_KEY_ENCRYPTION_SECRET ?? "e2e-key-encryption-secret-32ch!x",
    },
  },
});
