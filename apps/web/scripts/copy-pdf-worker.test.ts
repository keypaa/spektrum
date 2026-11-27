// @vitest-environment node
// The post-build worker copy must not fail a Vercel build when the
// standalone-only server chunk directory is absent. VPS/dev behaviour must
// stay exactly as strict as before.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyPdfWorkers } from "./copy-pdf-worker.mjs";

const SERVER_ARGS = ["node", "copy-pdf-worker.mjs", "--server"];
const DEV_ARGS = ["node", "copy-pdf-worker.mjs", "--server-dev"];

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "spektrum-copy-worker-"));
  mkdirSync(join(root, "public"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function harness() {
  const log = vi.fn();
  const warn = vi.fn();
  // Copy a tiny stub instead of pdfjs's multi-megabyte worker; create parent
  // directories so a missing-target failure cannot hide behind ENOENT.
  const copy = vi.fn((_source: string, target: string) => {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "stub worker");
  });
  const run = (overrides: Record<string, unknown> = {}) =>
    copyPdfWorkers({
      argv: SERVER_ARGS,
      env: {},
      baseDir: join(root, "scripts"),
      resolveModule: (id: string) => `/fake/${id}`,
      copy,
      log,
      warn,
      ...overrides,
    });
  return { run, log, warn, copy };
}

describe("copy-pdf-worker --server", () => {
  it("warns and exits successfully when VERCEL=1 has no server chunk directory", () => {
    const { run, warn, copy } = harness();

    expect(() => run({ env: { VERCEL: "1" } })).not.toThrow();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("VERCEL=1; skipping"),
    );
    // The client worker is still copied; only the server target is skipped,
    // and no `.next` directory is created in a serverless build.
    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy.mock.calls[0]?.[1]).toBe(join(root, "public/pdf.worker.min.mjs"));
    expect(existsSync(join(root, ".next"))).toBe(false);
  });

  it("still fails a VPS build when the server chunk directory is missing", () => {
    const { run, warn } = harness();

    expect(() => run()).toThrow(/does not exist; run this after `next build`/);
    expect(warn).not.toHaveBeenCalled();
  });

  it("copies the server worker to both VPS targets when they exist", () => {
    const chunks = join(root, ".next/server/chunks");
    const standalone = join(root, ".next/standalone/apps/web/.next/server/chunks");
    mkdirSync(chunks, { recursive: true });
    mkdirSync(standalone, { recursive: true });
    const { run, warn, copy } = harness();

    run();

    expect(warn).not.toHaveBeenCalled();
    expect(copy).toHaveBeenCalledTimes(3);
    expect(copy.mock.calls[1]?.[1]).toBe(join(chunks, "pdf.worker.mjs"));
    expect(copy.mock.calls[2]?.[1]).toBe(join(standalone, "pdf.worker.mjs"));
  });

  it("keeps the dev path that creates missing chunk directories", () => {
    const { run, copy } = harness();

    run({ argv: DEV_ARGS, env: { VERCEL: "1" } });

    expect(copy).toHaveBeenCalledTimes(3);
    expect(existsSync(join(root, ".next/server/chunks/pdf.worker.mjs"))).toBe(true);
    expect(
      existsSync(join(root, ".next/dev/server/chunks/pdf.worker.mjs")),
    ).toBe(true);
  });
});
