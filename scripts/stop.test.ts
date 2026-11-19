// @vitest-environment node
// stop.sh is exercised the same way deploy.sh is: a fake `docker` records the
// compose argv, so the assertions are about what would really run.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "stop.sh");
let scratch = "";

afterEach(() => {
  rmSync(scratch, { force: true, recursive: true });
});

type Run = { log: string; status: number; stdout: string; stderr: string };

/** Run stop.sh with a fake docker on PATH. */
function runStop(args: string[] = [], extraEnv: Record<string, string> = {}): Run {
  scratch = mkdtempSync(join(tmpdir(), "spektrum-stop-"));
  const log = join(scratch, "commands.log");

  const docker = `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "${log}"
exit 0
`;
  writeFileSync(join(scratch, "docker"), docker, { mode: 0o755 });
  chmodSync(join(scratch, "docker"), 0o755);

  const envFile = join(scratch, "stop.env");
  writeFileSync(
    envFile,
    ["PUBLIC_URL=https://app.example.com", "ACME_EMAIL=ops@example.com", ""].join("\n"),
  );

  const result = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${scratch}:${process.env.PATH}`,
      SPEKTRUM_ENV_FILE: envFile,
      ...extraEnv,
    },
  });

  let logText = "";
  try {
    logText = readFileSync(log, "utf8");
  } catch {
    logText = "";
  }
  return {
    log: logText,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("scripts/stop.sh", () => {
  it("is valid bash", () => {
    const result = spawnSync("bash", ["-n", script], { encoding: "utf8" });
    expect(result.status).toBe(0);
  });

  it("stops the stack and keeps the data volumes by default", () => {
    const run = runStop();
    expect(run.status).toBe(0);
    expect(run.log).toContain("compose -f docker/compose.prod.yml");
    expect(run.log).toContain("--env-file");
    // `down` without -v: volumes survive.
    expect(run.log).toMatch(/down --remove-orphans$/m);
    expect(run.log).not.toMatch(/down -v/);
    expect(run.stdout).toContain("Data volumes were kept");
  });

  it("deletes the volumes only when asked with --purge", () => {
    const run = runStop(["--purge"]);
    expect(run.status).toBe(0);
    expect(run.log).toMatch(/down -v --remove-orphans$/m);
    expect(run.stdout).toContain("DELETING all stack data");
    expect(run.stdout).toContain("deleted");
  });

  it("removes the images only when asked with --images", () => {
    const run = runStop(["--images"]);
    expect(run.status).toBe(0);
    expect(run.log).toContain("rmi spektrum-web:local");
    expect(run.log).toContain("rmi spektrum-worker:local");
    expect(run.log).toContain("rmi spektrum-migrate:local");
  });

  it("honours IMAGE_TAG for the images", () => {
    const run = runStop(["--images"], { IMAGE_TAG: "v2" });
    expect(run.log).toContain("rmi spektrum-web:v2");
  });

  it("rejects an unknown option instead of silently stopping", () => {
    const run = runStop(["--nuke"]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("unknown option");
    expect(run.log).toBe("");
  });

  it("fails clearly when .env is missing", () => {
    scratch = mkdtempSync(join(tmpdir(), "spektrum-stop-"));
    const bin = join(scratch, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "docker"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    const result = spawnSync("bash", [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        SPEKTRUM_ENV_FILE: join(scratch, "absent.env"),
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing");
  });
});