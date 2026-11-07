import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        name: "shared",
        test: {
          include: ["packages/shared/**/*.test.ts"],
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
        },
      },
      {
        name: "db",
        test: {
          include: ["packages/db/**/*.test.ts"],
          env: {
            DATABASE_URL:
              process.env.DATABASE_URL ??
              "postgres://spektrum:spektrum@localhost:5432/spektrum_test",
          },
        },
      },
    ],
  },
});
