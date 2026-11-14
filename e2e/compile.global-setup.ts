import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Global setup for the compile e2e: seed the database, then start the worker.
// The behavioural webServer only starts Next; the worker is a separate process.

const envLocal = resolve(process.cwd(), "apps/web/.env.local");
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

export default async function globalSetup(): Promise<() => Promise<void>> {
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "pnpm",
    ["--filter", "@spektrum/web", "exec", "tsx", "src/cli/e2e-seed.ts"],
    { stdio: "inherit", env: process.env },
  );

  const worker = spawn("pnpm", ["--filter", "@spektrum/worker", "dev"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  await new Promise<void>((resolvePromise, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`worker did not start: ${output.slice(-500)}`)),
      60_000,
    );
    worker.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      output += chunk.toString();
      if (output.includes("worker: ready")) {
        clearTimeout(timer);
        resolvePromise();
      }
    });
    worker.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      output += chunk.toString();
    });
    worker.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`worker exited early (${code}): ${output.slice(-500)}`));
    });
  });

  return async () => {
    worker.kill("SIGTERM");
  };
}