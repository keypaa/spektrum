// Generate the 12 captured TeX logs used by packages/latex tests (Task 3).
// Dev-only: compiles each fixture source in the texlive image and copies the
// resulting main.log. The `timeout` and `partial-render` fixtures are
// synthesised by truncating a real log (they cannot come from a normal run).
//
// Run: pnpm --filter @spektrum/web exec tsx scripts/gen-latex-fixtures.ts

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(process.cwd(), "../..");
const srcDir = join(repo, "packages/latex/fixtures/src");
const outDir = join(repo, "packages/latex/fixtures");
mkdirSync(outDir, { recursive: true });

const sources = readdirSync(srcDir).filter((f) => f.endsWith(".tex"));
for (const file of sources) {
  const name = file.replace(/\.tex$/, "");
  const work = mkdtempSync(join(tmpdir(), `spektrum-fix-${name}-`));
  cpSync(join(srcDir, file), join(work, "main.tex"));
  const program = name === "xelatex-unicode" ? "-xelatex" : "-pdf";
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${work}:/work`,
      "-w",
      "/work",
      "spektrum-texlive:dev",
      "sh",
      "-c",
      `latexmk -interaction=nonstopmode -file-line-error -synctex=1 ${program} -outdir=out main.tex || true`,
    ],
    { stdio: "inherit" },
  );
  const log = join(work, "out", "main.log");
  if (!existsSync(log)) throw new Error(`no log for ${name}`);
  cpSync(log, join(outDir, `${name}.log`));
  console.log(`${name}.log ${readFileSync(log, "utf8").length} bytes`);
}

// `timeout`: a real log cut before any `l.<n>` line (no line info).
const base = readFileSync(join(outDir, "undefined-control-sequence.log"), "utf8");
const cut = base.indexOf("l.3");
writeFileSync(
  join(outDir, "timeout.log"),
  cut > 0 ? base.slice(0, cut) : base.slice(0, 2000),
);

// `partial-render`: the first page's warnings, then stop.
const overfull = readFileSync(join(outDir, "overfull-hbox.log"), "utf8");
const page = overfull.indexOf("[1]");
writeFileSync(
  join(outDir, "partial-render.log"),
  page > 0 ? overfull.slice(0, page + 3) : overfull.slice(0, 1500),
);
console.log("timeout.log and partial-render.log synthesised");