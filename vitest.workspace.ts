import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
    ],
  },
});