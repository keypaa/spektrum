import { defineConfig } from "@playwright/test";

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
  // The owner's `aiEnabled` is true only with a server key (owner-only), so the
  // composer/transcript baselines render the enabled surface.
  LLM_API_KEY: "test-key",
};

export default defineConfig({
  testDir: "./e2e/visual",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    // The references are 2530x1380 physical with 64 px of Chrome on the left
    // and 53 px on top, i.e. a 2466x1327 app region. Their scale is 1.13, not
    // 1.1: the 300 px search pill measures 339 physical, the 576 px dialog
    // (max-w-xl) 651, the 36 px header buttons 41, and the 51 px row pitch
    // (50 + divider) 57.6. 2182 x 1.13 = 2465.7 -> 2466; 1174 x 1.13 = 1326.6
    // -> 1327. compare.ts crops 1:1, never rescales.
    viewport: { width: 2182, height: 1174 },
    deviceScaleFactor: 1.13,
    // Freeze CSS animations (Radix menu/dialog zoom+fade) and hide the caret
    // so screenshots are deterministic and identical to the captures.
    animations: "disabled",
    caret: "hide",
    trace: "off",
    channel: "chrome",
  },
  projects: [
    {
      name: "visual",
      // Everything except the banner spec: these run against port 3000
      // (SHUTDOWN_BANNER=false). baseURL/viewport come from the shared `use`.
      testIgnore: /banner\.spec\.ts/,
    },
    {
      name: "visual-banner",
      // Both banner baselines live in banner.spec.ts and run against port 3100
      // (SHUTDOWN_BANNER=true).
      testMatch: /banner\.spec\.ts/,
      // Only the origin differs; viewport/DSF inherit from the shared `use`.
      use: { baseURL: "http://localhost:3100" },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @spektrum/web exec next start -p 3000",
      url: "http://localhost:3000/login",
      // Never reuse: a `pnpm dev` server on 3000 renders a different page
      // (dev overlay, unminified CSS) and would silently corrupt the diff.
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...BASE_ENV,
        BETTER_AUTH_URL: "http://localhost:3000",
        SHUTDOWN_BANNER: "false",
      },
    },
    {
      command: "pnpm --filter @spektrum/web exec next start -p 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...BASE_ENV,
        BETTER_AUTH_URL: "http://localhost:3100",
        SHUTDOWN_BANNER: "true",
      },
    },
  ],
});
