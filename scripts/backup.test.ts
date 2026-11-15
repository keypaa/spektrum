// @vitest-environment node
// The backup path is exercised, not grepped: a fake `docker` answers the dump,
// a fake `pnpm` records the object/prune steps, and the assertions are about
// the order of real work and what survives a failure.
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "backup.sh");
const restoreScript = resolve(import.meta.dirname, "restore.sh");
const repoRoot = resolve(import.meta.dirname, "..");
const envFile = join(repoRoot, ".env");
const createdEnv = !existsSync(envFile);

const scratch: string[] = [];
const makeScratch = () => {
  const dir = mkdtempSync(join(tmpdir(), "spektrum-backup-"));
  scratch.push(dir);
  return dir;
};

afterEach(() => {
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true });
  if (createdEnv && existsSync(envFile)) rmSync(envFile);
});

/** Fake docker/pnpm on PATH. `pruneFails` makes the prune step exit non-zero. */
function fakeBin(dir: string, opts: { pruneFails?: boolean } = {}): string {
  const log = join(dir, "commands.log");
  const docker = `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "${log}"
if [[ "$*" == *"exec -T postgres pg_dump"* ]]; then printf 'DUMP'; fi
exit 0
`;
  const pnpm = `#!/usr/bin/env bash
printf 'pnpm %s\\n' "$*" >> "${log}"
if [[ "$*" == *prune-renders* ]] && [[ "${opts.pruneFails ? "1" : "0"}" == "1" ]]; then
  echo "prune exploded" >&2
  exit 1
fi
exit 0
`;
  writeFileSync(join(dir, "docker"), docker, { mode: 0o755 });
  writeFileSync(join(dir, "pnpm"), pnpm, { mode: 0o755 });
  chmodSync(join(dir, "docker"), 0o755);
  chmodSync(join(dir, "pnpm"), 0o755);
  return log;
}

function runBackup(destRoot: string, pruneFails = false) {
  const bin = makeScratch();
  const log = fakeBin(bin, { pruneFails });
  if (createdEnv) {
    writeFileSync(
      envFile,
      ["POSTGRES_USER=spektrum", "POSTGRES_DB=spektrum", "S3_BUCKET=b", "S3_PDF_BUCKET=p", ""].join("\n"),
    );
  }
  mkdirSync(destRoot, { recursive: true });
  const result = execFileSync("bash", [script], {
    stdio: "pipe",
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BACKUP_DEST_ROOT: destRoot },
  });
  return { log: readFileSync(log, "utf8"), result };
}

describe("scripts/backup.sh", () => {
  it("is valid bash", () => {
    expect(() => execFileSync("bash", ["-n", script], { stdio: "pipe" })).not.toThrow();
  });

  it("dumps the database first, then prunes, then copies the objects", () => {
    const destRoot = makeScratch();
    const { log } = runBackup(destRoot);
    const order = ["pg_dump", "prune-renders", "backup-objects"].map((needle) => ({
      needle,
      at: log.indexOf(needle),
    }));
    for (const step of order) expect(step.at).toBeGreaterThanOrEqual(0);
    expect(order[0]!.at).toBeLessThan(order[1]!.at);
    expect(order[1]!.at).toBeLessThan(order[2]!.at);
  });

  it("keeps the dump when render pruning fails", () => {
    const destRoot = makeScratch();
    const { result } = runBackup(destRoot, true);
    expect(result).toContain("backup complete");
    const dirs = readdirSync(destRoot).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    expect(dirs).toHaveLength(1);
    expect(readFileSync(join(destRoot, dirs[0]!, "db.dump"), "utf8")).toContain("DUMP");
  });

  it("prunes backup directories older than 7 days", () => {
    const destRoot = makeScratch();
    const old = join(destRoot, "2020-01-01");
    mkdirSync(old, { recursive: true });
    // Retention is by mtime, so backdate it past the 7-day window.
    const past = new Date("2020-01-01T00:00:00Z").getTime() / 1000;
    utimesSync(old, past, past);
    runBackup(destRoot);
    expect(existsSync(old)).toBe(false);
  });
});

describe("scripts/restore.sh", () => {
  it("is valid bash and stops the app before pg_restore", () => {
    expect(() => execFileSync("bash", ["-n", restoreScript], { stdio: "pipe" })).not.toThrow();
    const source = readFileSync(restoreScript, "utf8");
    expect(source).toContain("pg_restore");
    expect(source.indexOf("stop web worker")).toBeLessThan(source.indexOf("pg_restore"));
  });

  it("restarts web and worker from a trap even when the restore fails", () => {
    const source = readFileSync(restoreScript, "utf8");
    expect(source).toMatch(/trap restart EXIT/);
    expect(source).toMatch(/restart\(\)\s*\{/);
  });
});