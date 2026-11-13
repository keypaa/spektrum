// One real compile through the §10.6 sandbox (Task 2).
//
// Run: pnpm --filter @spektrum/web exec tsx scripts/compile-smoke.ts
// (cwd is apps/web; the repo root is two levels up). The .ts file wraps the
// shell block below with execFileSync("sh", ["-c", script]).

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// A 1x1 white JPEG: the example document's \includegraphics{diagram.jpg}.
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmAA/9k=",
  "base64",
);

const repo = resolve(process.cwd(), "../..");
const example = join(repo, "zenno/recon/extracted/example-main.tex");
if (!existsSync(example)) throw new Error(`missing ${example}`);

const work = mkdtempSync(join(tmpdir(), "spektrum-smoke-"));
cpSync(example, join(work, "main.tex"));
writeFileSync(join(work, "diagram.jpg"), TINY_JPEG);

const script = `
set -e
OUT="$WORK/out"
VOL="spektrum-smoke-vol-$$"
docker volume create "$VOL" >/dev/null
docker run --rm -v "$VOL:/work" "$IMAGE" sh -c 'chown 10001:10001 /work; touch /work/.keep; chown 10001:10001 /work/.keep'
CID=$(docker create --name "spektrum-compile-$$" --network none --read-only \
  --tmpfs /tmp:rw,size=256m,mode=1777 \
  --mount type=volume,src="$VOL",dst=/work,volume-nocopy \
  --user 10001 --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 128 --memory 1g --cpus 1 -e TEXMFVAR=/tmp/texmf -e HOME=/tmp -w /work \
  "$IMAGE" sh -c \
  'latexmk -interaction=nonstopmode -halt-on-error -file-line-error -synctex=1 \
   -no-shell-escape -pdf -outdir=/work/out main.tex; rc=$?; \
   texcount -total -merge -q main.tex > /work/texcount.txt; echo "$rc" > /work/latexmk.exit')
chmod -R a+rX "$WORK"
docker cp "$WORK/." "$CID:/work/"
docker start -a "$CID"
docker cp "$CID:/work/out" "$OUT"
docker cp "$CID:/work/texcount.txt" "$OUT/texcount.txt" 2>/dev/null || true
docker cp "$CID:/work/latexmk.exit" "$OUT/latexmk.exit" 2>/dev/null || true
docker rm -f "$CID"
docker volume rm "$VOL" >/dev/null
`;

const started = Date.now();
execFileSync("sh", ["-c", script], {
  env: { ...process.env, WORK: work, IMAGE: "spektrum-texlive:dev" },
  stdio: "inherit",
});
const elapsedMs = Date.now() - started;

const out = join(work, "out");
for (const name of ["main.pdf", "main.synctex.gz", "texcount.txt", "latexmk.exit"]) {
  if (!existsSync(join(out, name))) throw new Error(`missing out/${name}`);
}
const exitCode = readFileSync(join(out, "latexmk.exit"), "utf8").trim();
const pdfBytes = statSync(join(out, "main.pdf")).size;
console.log(`latexmk exit: ${exitCode}`);
console.log(`pdf bytes: ${pdfBytes}`);
console.log(`wall time: ${elapsedMs} ms`);
console.log(readFileSync(join(out, "texcount.txt"), "utf8").slice(0, 400));
if (exitCode !== "0") throw new Error("latexmk failed");
if (pdfBytes > 20 * 1024 * 1024) throw new Error("PDF exceeds 20 MB");