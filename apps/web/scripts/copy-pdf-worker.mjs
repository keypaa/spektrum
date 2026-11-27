import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Copy the pdf.js workers into the browser bundle and, for VPS/dev builds,
 * next to the server chunks. Exported so the VERCEL=1 skip case can be
 * unit-tested without touching the real build output.
 *
 * The injected dependencies are only for tests; production uses the defaults.
 */
export function copyPdfWorkers({
  argv = process.argv,
  env = process.env,
  baseDir = here,
  resolveModule = require.resolve,
  copy = copyFileSync,
  exists = existsSync,
  mkdir = mkdirSync,
  log = console.log,
  warn = console.warn,
} = {}) {
  const clientSource = resolveModule("pdfjs-dist/build/pdf.worker.min.mjs");
  const clientTarget = resolve(baseDir, "../public/pdf.worker.min.mjs");
  copy(clientSource, clientTarget);
  log("copied", clientSource, "->", clientTarget);

  // pdfjs's Node fallback imports "./pdf.worker.mjs" relative to the chunk it
  // was bundled into. Neither `next build` nor `next dev` emits that file, so
  // copy the worker next to the chunks. `--server` runs after `next build`
  // (the standalone output does not exist before it); `--server-dev` runs
  // before `next dev`. Vercel builds have no standalone output at all
  // (next.config.ts disables it when VERCEL=1), so that target is VPS-only.
  if (!argv.includes("--server") && !argv.includes("--server-dev")) return;

  const serverSource = resolveModule("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const dev = argv.includes("--server-dev");
  const targets = dev
    ? [
        resolve(baseDir, "../.next/server/chunks"),
        resolve(baseDir, "../.next/dev/server/chunks"),
      ]
    : [
        resolve(baseDir, "../.next/server/chunks"),
        ...(env.VERCEL === "1"
          ? []
          : [resolve(baseDir, "../.next/standalone/apps/web/.next/server/chunks")]),
      ];

  for (const dir of targets) {
    if (!exists(dir)) {
      if (env.VERCEL === "1" && !dev) {
        // A Vercel function bundle has no standalone/server chunk directory.
        // Skipping is correct there; failing the whole build is not.
        warn(
          `copy-pdf-worker: ${dir} does not exist with VERCEL=1; skipping the standalone-only server worker copy`,
        );
        continue;
      }
      if (!dev) {
        // A silently skipped target is exactly how the worker went missing in
        // production: fail the VPS build instead.
        throw new Error(
          `copy-pdf-worker: ${dir} does not exist; run this after \`next build\``,
        );
      }
      mkdir(dir, { recursive: true });
    }
    const target = resolve(dir, "pdf.worker.mjs");
    copy(serverSource, target);
    log("copied", serverSource, "->", target);
  }
}

// Run only when invoked as a script, not when imported by the unit test.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  copyPdfWorkers();
}
