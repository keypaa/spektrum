import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        name: "shared",
        test: {
          include: ["packages/shared/**/*.test.ts"],
          env: {
            REDIS_URL:
              process.env.REDIS_URL ?? "redis://localhost:6379",
          },
        },
      },
      {
        name: "ui",
        test: {
          include: ["packages/ui/**/*.test.ts", "packages/ui/**/*.test.tsx"],
          environment: "node",
        },
      },
      {
        name: "web",
        test: {
          include: ["apps/web/**/*.test.ts", "apps/web/**/*.test.tsx"],
          // DB-backed tests share one database — run them in a single worker
          // so test files execute sequentially and cannot race on cleanup /
          // owner rows. (Vitest 4+ removed poolOptions/singleFork; the
          // top-level maxWorkers option replaces them.)
          pool: "forks",
          maxWorkers: 1,
          env: {
            // spektrum_unit is the unit-test DB; spektrum_test is reserved for
            // e2e/dev and holds the real bootstrapped owner.
            DATABASE_URL:
              process.env.DATABASE_URL ??
              "postgres://spektrum:spektrum@localhost:5432/spektrum_unit",
            REDIS_URL: "redis://localhost:6379",
            BETTER_AUTH_SECRET: "test-secret-32-chars-minimum!!!!!!",
            BETTER_AUTH_URL: "http://localhost:3000",
            LLM_KEY_ENCRYPTION_SECRET: "test-key-encryption-secret-32ch!",
          },
        },
      },
      {
        name: "db",
        test: {
          include: ["packages/db/**/*.test.ts"],
          env: {
            DATABASE_URL:
              process.env.DATABASE_URL ??
              "postgres://spektrum:spektrum@localhost:5432/spektrum_unit",
          },
        },
      },
    ],
  },
});
