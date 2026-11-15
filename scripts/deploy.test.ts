// @vitest-environment node
// The deploy path is exercised, not grepped: a fake `docker` on PATH records
// the exact commands the script issues, and a fake `curl` answers the health
// probe. That is what catches "pull a service that was never pushed".
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "deploy.sh");
const repoRoot = resolve(import.meta.dirname, "..");
const envFile = join(repoRoot, ".env");

const createdEnv = !existsSync(envFile);

afterEach(() => {
  // The script sources the repo's real .env; remove ours, keep the operator's.
  if (createdEnv && existsSync(envFile)) rmSync(envFile);
});

type Run = { log: string; status: number; stderr: string };

/** Run deploy.sh with fake docker/curl binaries on PATH. */
function runDeploy(extraEnv: Record<string, string> = {}): Run {
  const bin = mkdtempSync(join(tmpdir(), "spektrum-deploy-"));
  const log = join(bin, "commands.log");

  const docker = `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "${log}"
case "$1 $2" in
  "compose pull") exit 1 ;;   # a service with only a local build: cannot pull
  *) exit 0 ;;
esac
`;
  const curl = `#!/usr/bin/env bash
printf 'curl %s\\n' "$*" >> "${log}"
exit 0
`;
  writeFileSync(join(bin, "docker"), docker, { mode: 0o755 });
  writeFileSync(join(bin, "curl"), curl, { mode: 0o755 });
  chmodSync(join(bin, "docker"), 0o755);

  if (createdEnv) {
    writeFileSync(
      envFile,
      ["PUBLIC_URL=https://app.example.com", "ACME_EMAIL=ops@example.com", ""].join("\n"),
    );
  }

  try {
    execFileSync("bash", [script], {
      stdio: "pipe",
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HEALTH_ATTEMPTS: "1",
        HEALTH_INTERVAL: "1",
        ...extraEnv,
      },
    });
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string };
    return { log: readFileSync(log, "utf8"), status: 1, stderr: `${err.stderr ?? ""}` };
  }
  return { log: readFileSync(log, "utf8"), status: 0, stderr: "" };
}

describe("scripts/deploy.sh", () => {
  it("is valid bash", () => {
    expect(() =>
      execFileSync("bash", ["-n", script], { stdio: "pipe" }),
    ).not.toThrow();
  });

  it("builds the images, migrates, then starts the stack — never pulls", () => {
    const run = runDeploy();
    expect(run.status).toBe(0);

    const commands = run.log
      .split("\n")
      .filter((line) => line.startsWith("docker "))
      .map((line) => line.replace(/^docker compose -f docker\/compose\.prod\.yml --env-file \.env /, ""));

    expect(commands).toContain("build");
    expect(commands).not.toContain("pull");
    expect(commands.indexOf("build")).toBeLessThan(commands.indexOf("up -d web worker caddy"));
    expect(commands.indexOf("wait migrate")).toBeLessThan(commands.indexOf("up -d web worker caddy"));
    expect(commands.some((c) => c.startsWith("up -d migrate"))).toBe(true);
  });

  it("pulls instead of building when IMAGE_REGISTRY is set", () => {
    const run = runDeploy({ IMAGE_REGISTRY: "ghcr.io/example" });
    expect(run.log).toContain("pull");
    expect(run.log).not.toContain("build");
  });

  it("probes /api/health after the rollout", () => {
    const run = runDeploy();
    expect(run.log).toContain("curl -fsS https://app.example.com/api/health");
  });
});