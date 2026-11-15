// @vitest-environment node
// The backup scripts are shell; the only mechanical check that does not need a
// live stack is `bash -n`, plus the invariants that keep a restore safe.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dir = import.meta.dirname;
const backup = resolve(dir, "backup.sh");
const restore = resolve(dir, "restore.sh");
const read = (p: string) => readFileSync(p, "utf8");

describe("backup.sh / restore.sh", () => {
  it("are valid bash", () => {
    for (const script of [backup, restore]) {
      expect(() =>
        execFileSync("bash", ["-n", script], { stdio: "pipe" }),
      ).not.toThrow();
    }
  });

  it("dumps postgres, copies the buckets and prunes after 7 days", () => {
    const text = read(backup);
    expect(text).toContain("pg_dump");
    expect(text).toContain("backup-objects.ts");
    expect(text).toContain('mkdir -p "$DEST"');
    expect(text).toContain('find "$DEST_ROOT" -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +');
  });

  it("stops the app before restoring and never restores into a live DB", () => {
    const text = read(restore);
    expect(text).toContain("stop web worker");
    expect(text.indexOf("stop web worker")).toBeLessThan(text.indexOf("pg_restore"));
    expect(text).toContain("pg_restore");
    expect(text).toContain("restore-objects.ts");
  });

  it("ships a nightly cron entry", () => {
    expect(read(resolve(dir, "../docker/backup.cron"))).toMatch(/^0 3 \* \* \*/m);
  });
});