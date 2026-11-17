// @vitest-environment node
// dc.sh exists because a bare `docker compose` from the repo root cannot
// interpolate ${VAR} — so it is exercised, not grepped: a fake `docker` on PATH
// records argv, and a fake `uname` pins the architecture branch so the test
// does not depend on what the CI runner happens to be.
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

const script = resolve(import.meta.dirname, "dc.sh");
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Run = { log: string; status: number; stderr: string };

/** Run dc.sh with a fake docker (and optionally uname) on PATH. */
function runDc(
  args: string[],
  { arch, writeEnv = true }: { arch?: string; writeEnv?: boolean } = {},
): Run {
  const dir = mkdtempSync(join(tmpdir(), "spektrum-dc-"));
  scratch.push(dir);
  const log = join(dir, "commands.log");

  const docker = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${log}"
`;
  writeFileSync(join(dir, "docker"), docker);
  chmodSync(join(dir, "docker"), 0o755);

  if (arch) {
    const uname = `#!/usr/bin/env bash
echo "${arch}"
`;
    writeFileSync(join(dir, "uname"), uname);
    chmodSync(join(dir, "uname"), 0o755);
  }

  const envFile = join(dir, "dc.env");
  if (writeEnv) {
    writeFileSync(
      envFile,
      ["PUBLIC_URL=https://app.example.com", "ACME_EMAIL=ops@example.com", ""].join("\n"),
    );
  }

  try {
    execFileSync("bash", [script, ...args], {
      stdio: "pipe",
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        SPEKTRUM_ENV_FILE: envFile,
      },
    });
  } catch (e) {
    const err = e as { stderr?: string };
    return {
      log: existsSync(log) ? readFileSync(log, "utf8") : "",
      status: 1,
      stderr: `${err.stderr ?? ""}`,
    };
  }
  return { log: readFileSync(log, "utf8"), status: 0, stderr: "" };
}

describe("scripts/dc.sh", () => {
  it("is valid bash", () => {
    expect(() =>
      execFileSync("bash", ["-n", script], { stdio: "pipe" }),
    ).not.toThrow();
  });

  it("forwards the subcommand and always passes --env-file", () => {
    const run = runDc(["ps", "--format", "{{.Service}}"]);
    expect(run.status).toBe(0);
    expect(run.log.trim()).toMatch(
      /^compose -f docker\/compose\.prod\.yml --env-file \S+\/dc\.env ps --format \{\{\.Service\}\}$/,
    );
  });

  it("appends the arm64 pins on aarch64", () => {
    const run = runDc(["ps"], { arch: "aarch64" });
    expect(run.log).toContain(
      "-f docker/compose.prod.yml -f docker/compose.arm64.yml",
    );
    // The override must precede the subcommand, or compose treats it as one.
    expect(run.log.indexOf("compose.arm64.yml")).toBeLessThan(
      run.log.indexOf("--env-file"),
    );
  });

  it("does not append the arm64 pins on x86_64", () => {
    const run = runDc(["ps"], { arch: "x86_64" });
    expect(run.log).not.toContain("compose.arm64.yml");
  });

  it("fails clearly instead of running compose when .env is missing", () => {
    const run = runDc(["ps"], { writeEnv: false });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("missing");
    expect(run.log).toBe("");
  });
});
