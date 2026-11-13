import { fileURLToPath } from "node:url";
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
        resolve: {
          // apps/web source uses the "@/..." path alias (tsconfig paths)
          alias: {
            "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
          },
        },
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
        name: "latex",
        test: {
          include: ["packages/latex/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        name: "storage",
        test: {
          include: ["packages/storage/**/*.test.ts"],
          environment: "node",
          env: {
            S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
            S3_BUCKET: process.env.S3_BUCKET ?? "spektrum-pdf",
            S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? "spektrum",
            S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? "spektrum-secret",
          },
        },
      },
      {
        name: "worker",
        test: {
          include: ["apps/worker/**/*.test.ts"],
          environment: "node",
          pool: "forks",
          maxWorkers: 1,
          env: {
            DATABASE_URL:
              process.env.DATABASE_URL ??
              "postgres://spektrum:spektrum@localhost:5432/spektrum_unit",
            REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
            BETTER_AUTH_SECRET: "test-secret-32-chars-minimum!!!!!!",
            BETTER_AUTH_URL: "http://localhost:3000",
            LLM_KEY_ENCRYPTION_SECRET: "test-key-encryption-secret-32ch!",
            S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
            S3_BUCKET: process.env.S3_BUCKET ?? "spektrum-pdf",
            S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? "spektrum",
            S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? "spektrum-secret",
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
