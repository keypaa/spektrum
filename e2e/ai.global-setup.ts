import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Global setup for the AI e2e: seed the owner/member projects and the seeded
// failed render. The webServer array starts Next and the mock gateway.

const envLocal = resolve(process.cwd(), "apps/web/.env.local");
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

export default async function globalSetup(): Promise<void> {
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "pnpm",
    ["--filter", "@spektrum/web", "exec", "tsx", "src/cli/e2e-ai-seed.ts"],
    { stdio: "inherit", env: process.env },
  );
}