import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const clientSource = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
copyFileSync(clientSource, new URL("../public/pdf.worker.min.mjs", import.meta.url));
console.log("copied", clientSource, "-> apps/web/public/pdf.worker.min.mjs");

// pdfjs's Node fallback imports "./pdf.worker.mjs" relative to the chunk it was
// bundled into. Neither `next build` nor `next dev` emits that file, so copy
// the worker next to the chunks. `--server` runs after `next build` (the
// standalone output does not exist before it); `--server-dev` runs before
// `next dev`. Vercel builds have no standalone output at all (next.config.ts
// disables it when VERCEL=1), so that target is VPS-only.
if (process.argv.includes("--server") || process.argv.includes("--server-dev")) {
  const serverSource = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const dev = process.argv.includes("--server-dev");
  const targets = dev
    ? [
        resolve(here, "../.next/server/chunks"),
        resolve(here, "../.next/dev/server/chunks"),
      ]
    : [
        resolve(here, "../.next/server/chunks"),
        ...(process.env.VERCEL === "1"
          ? []
          : [resolve(here, "../.next/standalone/apps/web/.next/server/chunks")]),
      ];
  for (const dir of targets) {
    if (!existsSync(dir)) {
      if (!dev) {
        // A silently skipped target is exactly how the worker went missing in
        // production: fail the build instead.
        throw new Error(
          `copy-pdf-worker: ${dir} does not exist; run this after \`next build\``,
        );
      }
      mkdirSync(dir, { recursive: true });
    }
    copyFileSync(serverSource, resolve(dir, "pdf.worker.mjs"));
    console.log("copied", serverSource, "->", resolve(dir, "pdf.worker.mjs"));
  }
}
