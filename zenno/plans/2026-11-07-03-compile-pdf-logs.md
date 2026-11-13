# Compile, PDF and Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A keystroke becomes a compiled PDF in the right pane in under 3 s, and every compile error lands in the Logs panel at the right line.

**Architecture:** The web app validates the request, computes the project revision and enqueues a compile job on Redis (BullMQ). A separate worker materialises the project into a one-shot, network-less texlive container, runs `latexmk`, parses the `.log` and `.synctex.gz` in Node, uploads the PDF and the SyncTeX map to S3, writes the `pdf_renders` row, and publishes progress on a Redis channel. The browser subscribes over SSE, renders the PDF with `pdfjs-dist`, and drives the Info panel (Project Info, Versions, Comments, Logs) from the render row.

**Tech Stack:** Node 26.13.0, TypeScript 6.0.3, Next 16.4.5 (App Router, route handlers, SSE), React 19.3.1, BullMQ + ioredis, `@aws-sdk/client-s3`, `pdfjs-dist`, Drizzle ORM + Postgres 16, MinIO (dev), Vitest 5.1.0, Playwright 1.65.0.

**Spec:** `zenno/specs/2026-11-07-spektrum-design.md` (authoritative for *what*; §3.1 architecture, §8 PDF viewer, §9 Info panel, §11 compile, §11.3 log parsing, §11.4 progress stream, §11.5 TeX environment, §11.6 SyncTeX, §15.1–15.3 gates, §16 Phase 3 row). Phase 2 handoffs: `zenno/plans/2026-11-07-02-editor.md` (lines 60, 77, 886, 1561, 1787).

## Global Constraints

- **Pinned toolchain** (spec §3.2): Node **26.13.0**, pnpm **12.18.0**, TypeScript **6.0.3**, Next **16.4.5**, React **19.3.1**, Tailwind **4.3.5**, Drizzle **0.45.4**, zod **4.6.7**, Vitest **5.1.0**, Playwright **1.65.0**. Do not upgrade any of them in this phase.
- **Nothing compiles in the browser** (spec §3.1). The route path carries `projectId`, the body carries `mainFile`, and the client receives a PDF URL + diagnostics.
- **The database is the source of truth** (spec §11.0). Compile requests carry no content; the worker reads the persisted revision and records the **same** hash the web route computed — one implementation, `@spektrum/shared/revision`, imported by both (a second copy would silently miss the render cache).
- **Ownership on every route**: every project/document/render/snapshot handler resolves `requireUser()` and inner-joins `projects` on `id AND ownerId AND deletedAt IS NULL`. Unknown or malformed ids → 404, never 500 (Phase 2 precedent, commit `1f2d8e5`).
- **Mutating routes** call `assertSameOrigin(req, loadWebEnv().authUrl)`; read-only routes do not. The compile route is rate-limited (`consume("compile:" + user.id, BUDGETS.compile)`, 429 + `Retry-After`).
- **Compile sandbox** (spec §10.6, non-negotiable): one container per compile from the pinned image, `--network none`, `--read-only` root with tmpfs `/tmp` and `/work`, `--user 10001`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--pids-limit 128`, `--memory 1g`, `--cpus 1`, `TEXMFVAR` in tmpfs, `openin_any=p` and `shell_escape=f` baked into the image, wall clock 30 s (SIGTERM → SIGKILL), PDF capped at 20 MB.
- **API shapes**: compile `POST …/compile` `{ mainFile }` → `202 { revision }`; SSE `GET …/render/stream` with `status|log|result|conflict`; PDF `GET …/render/:revision/pdf`; logs `GET …/render/:revision/log`; synctex `GET …/render/:revision/synctex`; latest `GET …/render/latest`; snapshots `200 { snapshots }`, restore `200 { document }`. **§19.3 of the spec pins different routes; Task 1 amends it and adds the §18 row in the same commit (spec §19.6).**
- **Icons**: every `<svg>` has `viewBox="0 0 16 16"` and uses `currentColor` only; no emoji and no Unicode glyph used as an icon (spec §5.8/§15.2). Reuse `packages/ui/src/icons`; add only `IconFitZoom` (alias of the existing `IconFit`) and `IconLink` if missing.
- **Copy is verbatim** from the captures/spec (§8.1, §9, Appendix C). No new user-facing wording beyond Appendix C.
- **Visual budget**: `pnpm test:visual` stays `continue-on-error: true` in CI and records the ratio; it is a measurement, not a gate (spec §15.1). The **hard release gate** is keystroke → PDF < 3 s for the example document (spec §15.3).
- **e2e runs serially** (`workers: 1`, every spec drives the one owner/DB), and each test gets a fresh `x-forwarded-for` through `login(page)` (`e2e/helpers.ts`). Sign-in rate limit is 5 / 15 min / IP.
- **Every new package or dependency runs `pnpm install` and commits `pnpm-lock.yaml`** — CI uses `--frozen-lockfile` (`.github/workflows/ci.yml:29`).
- **The right pane is exactly one of PDF viewer or Info panel; the `Tools` menu switches it** (spec §6.3). Closing the panel returns to the PDF; it is not an overlay and it is 677 px wide, the right pane's width.
- **No `dangerouslySetInnerHTML`** outside the sanitised PDF text layer (spec §15.2). The Phase 2 theme pre-paint script in `apps/web/src/app/layout.tsx` is the only existing exception.

## Review Focus

The spec implies these failure modes but no task's happy path exercises them. Each line names the test that pins it, in the task that owns the code.

1. **A newer revision arrives while a compile is running.** The old compile must not overwrite the new one or leave the status pill claiming `Compiled`. → e2e "a newer edit supersedes the running compile" (Task 16) and the worker's supersede unit test (Task 7).
2. **A compile fails when a previous PDF exists.** The viewer keeps the old PDF and the pill reads `Failed`; it never goes blank (spec §11.2 partial renders). → e2e "a failing compile keeps the last good PDF" (Task 16).
3. **Diagnostic line numbers are off by one.** TeX's `l.<n>` is 1-based, our model is 0-based, and the UI is 1-based; `-file-line-error` prefixes the file. Clicking an error must land on the exact line. → parser unit tests over the captured fixtures (Task 3) and the click-to-line e2e (Task 16).
4. **SyncTeX coordinates land on the wrong page or the wrong line.** `sp` → PDF points → page-relative fractions must be zoom-independent, and reverse lookup must pick the nearest anchor, not the first. → `packages/latex/synctex.test.ts` with a captured map (Task 5) and the viewer's hit-test test (Task 13).
5. **A render leaks across owners.** A second user who guesses `projectId/revision` must get 404. → route test "another owner's render is 404" (Task 9) and a bucket-policy assertion in Task 6 (no anonymous read).
6. **The worker dies mid-compile.** A `running` row must not wedge the project forever, and the Redis lock must not outlive it. → worker boot recovery test (Task 7).
7. **Line-number boundaries.** `Diagnostic.line` is 0-based in the model, TeX and the UI are 1-based, and SyncTeX lines are 1-based per file; mixing them puts the cursor on the wrong line. → parser tests (Task 3), the Logs click (Task 14) and the SyncTeX forward map (Task 5/13) each pin one boundary.

---

## What Phase 3 ships (and what it deliberately does not)

Ships: the compile pipeline (worker, texlive image, latexmk, queue, coalescing), the PDF viewer (chrome, zoom, page input, search overlay, dark mode, download, fullscreen), SyncTeX both directions, the Logs panel, the Info panel with **Project Info** (texcount), **Versions** (snapshots + restore), **Comments** (empty state) and **Share** (dialog, Invite disabled), the SSE status stream, and the visual baselines for captures 18, 23–32, 35, 40, 41.

Does not ship: AI (`Fix with AI`, `Fix all with AI` render disabled — Phase 4), comment creation, real sharing/collab, import/export (Phase 5), the `projectPageSections` other than the editor, and a production TeX image registry (Phase 5; CI builds and caches the image).

## File Structure

```
apps/worker/                          new app (compile worker)
  package.json                        @spektrum/worker: bullmq, ioredis, tsx, @spektrum/{db,latex,shared,storage}
  src/index.ts                        process entry: BullMQ Worker, boot recovery, graceful stop
  src/compile.ts                      one compile: materialise → container → parse → upload → row → publish
  src/container.ts                    docker run wrapper (caps, no network, timeout, kill)
  src/materialise.ts                  write the project's documents into a temp /work dir
  src/publish.ts                      Redis pub/sub publisher for render events
  src/recover.ts                      mark stale `running` rows as error on boot
  src/queue.ts                        shared Redis/BullMQ connection + queue name

packages/latex/                       new package (pure TS; depends on @spektrum/shared for the non-throwing path sanitiser)
  src/index.ts                        re-exports
  src/parse-log.ts                    main.log → Diagnostic[] (spec §11.3)
  src/stats.ts                        texcount output + figure/math counts → ProjectStats
  src/synctex.ts                      .synctex.gz → SyncTexMap (spec §11.6)
  fixtures/*.log                      12 captured logs (Appendix B)
  fixtures/synctex/*.synctex.gz       one captured map
  fixtures/texcount/*.txt             captured texcount output

packages/shared/src/compile.ts        zod contracts: CompileJob, Diagnostic, SyncTexMap, ProjectStats, RenderEvent
packages/shared/src/paths.ts          normalizeDocumentPath (moved out of apps/web so the worker can use it)
packages/shared/src/revision.ts       revisionHash (moved out of apps/web; imported by web + worker)

packages/storage/                     new package (server-only S3)
  src/index.ts                        putObject, getObject, getObjectRange, deleteObject

apps/web/src/app/api/projects/[projectId]/
  compile/route.ts                    POST: validate + dedupe + enqueue (202 { revision })
  render/stream/route.ts              GET: SSE over Redis pub/sub
  render/latest/route.ts              GET: latest render row for the Info panel
  render/[revision]/pdf/route.ts      GET: auth-checked PDF stream (Range passthrough)
  render/[revision]/synctex/route.ts  GET: auth-checked SyncTeX JSON
  render/[revision]/log/route.ts      GET: the stored log tail for Raw logs
  snapshots/route.ts                  GET: list versions
  snapshots/[snapshotId]/restore/route.ts  POST: restore a snapshot

apps/web/src/lib/
  render-store.ts                     server: S3-backed render reads (presign-free)
  compile-client.ts                   browser: POST compile
  render-client.ts                    browser: RenderEvent parsing + useRenderStream

packages/db/src/snapshots.ts          snapshotAfterCompile / pruneSnapshots / restoreSnapshot (ownership-scoped, shared by web + worker; exported as @spektrum/db/snapshots)

apps/web/src/components/pdf/
  pdf-viewer.tsx                      pdfjs canvas host, virtualised by page, zoom, dark mode
  pdf-chrome.tsx                      status pill + popover, page input, zoom menu, ⋯ menu, floating bar
  pdf-search.tsx                      the dark search pill + hit highlights
  use-pdf-document.ts                 pdfjs loading, page observer, cleanup
  use-sync-scroll.ts                  cursor → page scroll + line rect (forward)
  use-sync-jump.ts                    PDF double-click → editor line (backward)

apps/web/src/components/info-panel/
  info-panel.tsx                      tab shell (Project Info, Versions, Comments, Logs), 44 px tabs
  project-info.tsx                    stat cards from ProjectStats
  versions.tsx                        date-grouped snapshot list + restore menu
  comments.tsx                        the "No comments yet" empty state
  logs.tsx                            diagnostics list, filter menu, raw tail, jump-to-line
  share-dialog.tsx                    Share dialog (Invite disabled)

docker/texlive/Dockerfile             TeX Live + latexmk image (spec §11.5)
scripts/build-texlive.sh              one-shot image build (CI and local; shell, so it stays at the root)
apps/web/scripts/compile-smoke.ts     one real compile through the §10.6 sandbox
apps/web/scripts/gen-latex-fixtures.ts compile broken docs → capture logs into packages/latex/fixtures

e2e/compile.spec.ts                   behavioural: <3 s, supersede, failure keeps PDF, conflict
e2e/pdf.spec.ts                       viewer behaviour: zoom, page input, search, dark mode, SyncTeX
e2e/info-panel.spec.ts                Logs + Project Info + Versions + Comments + Share
e2e/visual/pdf.spec.ts                baselines: 18, 31–32, 40, 41
e2e/visual/logs.spec.ts               baselines: 29–30
```

Existing files the tasks touch: `packages/db/src/schema.ts` (render status enum, `stats`), `apps/web/src/app/(app)/u/[projectId]/page.tsx` (latest render), `editor-client.tsx` (compile triggers, right pane, Info panel), `pdf-pane.tsx` (replaced by the viewer), `use-autosave.ts` (compile on save), `packages/ui/src/icons/*` (new icons), `e2e/visual/compare.ts` (no change; new cases only).

---

### Task 1: Compile contracts and the render-row migration

**Files:**
- Create: `packages/shared/src/compile.ts`
- Modify: `packages/shared/src/index.ts` (re-export only `compile`), `packages/shared/package.json` (`./revision` + `./paths` subpaths), `packages/shared/src/revision.ts` and `src/paths.ts` (moved from `apps/web/src/lib`), `packages/shared/tsconfig.json` (include `*.test.ts`), `apps/web/src/lib/revision.test.ts` (moved to `packages/shared/src/`), `vitest.config.ts` (new projects), `zenno/specs/2026-11-07-spektrum-design.md` (§19.3, §11.4, §4, §11.2, §18)
- Modify: `packages/db/src/schema.ts` (render status enum + `stats`)
- Create: `packages/db/drizzle/<generated>.sql` via `pnpm db:generate`
- Test: `packages/shared/src/compile.test.ts`

**Interfaces:**
- Produces: `CompileJob`, `Diagnostic`, `SyncTexMap`, `ProjectStats`, `RenderEvent`, `renderStatus` (enum with `queued | running | ok | error | superseded`), and `@spektrum/shared/revision` (`contentHash`, `revisionHash`, `RevisionDocument`).

- [ ] **Step 1: Write the failing test** — `compile.test.ts` parses a sample job, a sample event and a sample stats object; asserts `RenderEvent` rejects an unknown `event` value and that `Diagnostic.line` is a non-negative integer.

```ts
import { describe, expect, it } from "vitest";
import { compileJobSchema, diagnosticSchema, renderEventSchema, projectStatsSchema } from "./compile";

describe("compile contracts", () => {
  it("accepts a compile job", () => {
    expect(compileJobSchema.parse({ projectId: crypto.randomUUID(), revisionHash: "a".repeat(64), mainFile: "main.tex" }).mainFile).toBe("main.tex");
  });
  it("rejects a diagnostic with a negative line", () => {
    expect(diagnosticSchema.safeParse({ severity: "error", message: "x", line: -1, raw: "" }).success).toBe(false);
  });
  it("rejects an unknown render event", () => {
    expect(renderEventSchema.safeParse({ event: "bogus" }).success).toBe(false);
  });
  it("accepts project stats", () => {
    expect(projectStatsSchema.parse({ words: 1, wordsInText: 1, wordsInHeaders: 0, wordsOutsideText: 0, headers: 0, figures: 0, mathInline: 0, mathDisplay: 0 }).words).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail** — `pnpm exec vitest run packages/shared` → FAIL (module not found).
- [ ] **Step 3: Implement `packages/shared/src/compile.ts`** with the schemas in the Interfaces block (`z.discriminatedUnion("event", …)` for `RenderEvent`: `status { state, revision }`, `log { line }`, `result { pdfUrl, diagnostics, stats, durationMs }`, `conflict { revision }`).
- [ ] **Step 4: Extend the DB schema** — `renderStatusEnum` gains `"running"` and `"superseded"`; `pdfRenders` gains `stats: jsonb("stats").$type<ProjectStats>()` (nullable; the `$type` keeps reads typed instead of `unknown`) and **`mainFile: text("main_file")`** (the popover must show the file that was compiled, not the current main document — spec §4's SQL block is amended with it). `packages/db` gains a type-only dependency on `@spektrum/shared` for `ProjectStats`; run `pnpm install` and commit the lockfile. `pdfRenders.diagnostics` gains `.$type<Diagnostic[]>()`, so the producer and the `render/latest` consumer meet on a type instead of `unknown`. Run `pnpm db:generate && pnpm db:migrate`, then `pnpm exec vitest run --project db` (the package has no Vitest config; the root config supplies `DATABASE_URL`).
- [ ] **Step 5: Move the revision hash into `@spektrum/shared/revision`** — `apps/web/src/lib/revision.ts` imports `node:crypto`, so it must not enter the root `@spektrum/shared` index (client code imports that). Move the file, add both `"./revision": "./src/revision.ts"` and `"./paths": "./src/paths.ts"` to the exports map (the plan previously added only the first), and update every call site: `apps/web/src/lib/documents.ts:15` (the import line) and `apps/web/src/lib/documents.test.ts:23` (which imports `./revision`). Extend `RevisionDocument` with `blobKey: string | null` so a blob-only document contributes its content-addressed key (`content ?? blobKey`) instead of the empty string — and **extend `listRevisionDocuments` to select `blobKey`**, or the web-computed hash and the worker's will disagree on any project with an image. Also move `DocumentPathError`, `DocumentPathErrorCode` and the private `MAX_PATH_LENGTH` with `normalizeDocumentPath` into `@spektrum/shared/paths` (the error class is pure) and re-export both from `documents.ts`, so the three route files and `documents.test.ts` keep their imports. **Move `apps/web/src/lib/revision.test.ts` to `packages/shared/src/revision.test.ts`**, change its import to `./revision`, add `blobKey: null` to every `RevisionDocument` literal, (`packages/shared/tsconfig.json` already includes `src/**/*.ts`, so the moved test is typechecked; verify it is picked up). Also add **`sanitizeDiagnosticPath(input: string): string`** to `@spektrum/shared/paths` — a non-throwing variant of `normalizeDocumentPath` (strip a leading `./`, drop `..` segments, replace `\`/control characters, cap the length) for `parseLog`; `normalizeDocumentPath` throws on `../x.tex:12:` and would fail the compile instead of producing a diagnostic. Test `./main.tex` → `main.tex`, `../x` → `x`, and a backslash/control path. Add a test that the web and the worker compute the same hash for the same document set.
- [ ] **Step 6: Amend every stale spec section** — §19.3 (replace the `{ revisionHash }` body, `/api/jobs/:jobId/events`, the `?revision=` result/logs/synctex routes and the `queued|building|rendered|error` names with the plan's `render/*` routes, `{ mainFile } → { revision }` and `status|log|result|conflict`); §11.4 (the same event set, plus `stats`/`pdfUrl`/`superseded`); §4's SQL block (`main_file`, the widened status enum, `stats`, `diagnostics`); §11.0 and §19.2 (the revision formula: the spec says `path + "\0" + sha256(content)` over **non-hidden** files, but hidden files are a per-user preference and the code uses `path || sha256(content ?? blobKey)` over **every** document — amend both to the shipped formula and delete the `\0`/non-hidden wording); §11.2 steps 4–5 (the job basename, not `out/main.*`; the magic comment and `pdflatex` default; no project setting) and step 8 (newest wins, no container abort — D50); §9.2 (text documents only — D60); §10.5 (the 60/h throttle behaviour); §15.1 (the Comments filter menu is also captured — row 28); §16 (the Phase 3 visual list). Add the spec-relevant §18 rows D44–D63 in the same commit, per §19.6.
- [ ] **Step 7: Register the new Vitest projects** — `vitest.config.ts` enumerates projects explicitly (`shared`, `ui`, `web`, `db`), so a test in a new package silently never runs. Add `latex`, `storage` and `worker` with the same env as `web` (`DATABASE_URL`, `REDIS_URL`, auth secrets) **plus `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`** for the storage/worker suites (the `web` env block has none, so the S3 tests would otherwise silently skip). The `web` project uses `pool: "forks", maxWorkers: 1` because DB tests share `spektrum_unit`; copy that to `worker` (projects run in parallel, and two projects on one DB race). Each new package also needs a `tsconfig.json` extending `../../tsconfig.base.json` (see `packages/ui/tsconfig.json`), or `pnpm -r exec tsc --noEmit` fails with TS18003.
- [ ] **Step 8: Run the tests and typecheck** — `pnpm exec vitest run packages/shared packages/db && pnpm typecheck` → PASS.
- [ ] **Step 9: Commit** — `feat(compile): add shared render contracts, the revision subpath and the spec amendment`.

### Task 2: The texlive image and a real compile smoke test

**Files:**
- Create: `docker/texlive/Dockerfile`, `scripts/build-texlive.sh`, `apps/web/scripts/compile-smoke.ts`
- Test: the smoke script itself (run once, output committed to the ledger)

**Interfaces:**
- Produces: the image `spektrum-texlive:dev` and the exact `latexmk` invocation later tasks reuse.

- [ ] **Step 1: Write the Dockerfile** from spec §11.5: `debian:bookworm-slim`, `texlive-latex-base`, `texlive-latex-extra`, `texlive-fonts-recommended`, `texlive-science`, `texlive-pictures`, `texlive-xetex`, `texlive-luatex`, `texlive-bibtex-extra`, `texlive-lang-english`, `texlive-lang-french`, `texlive-extra-utils` (Debian ships `texcount` there), `latexmk`; create the user with uid/gid **10001**; `ENV DEBIAN_FRONTEND=noninteractive`, `TEXMFVAR=/tmp/texmf`, `TEXMFHOME=/tmp/texmfhome`, `TEXMFCNF=/etc/texmf:/usr/share/texlive/texmf-dist/web2c`; write **`/etc/texmf/texmf.cnf`** (not `/usr/local/texlive` — Debian's kpathsea does not read that path) with `openin_any = p` and `shell_escape = f` (spec §10.6; TeX Live's defaults are `a` and restricted, so this must be explicit). Keep the package list in one block with a comment citing §11.5.
- [ ] **Step 2: Build and record the digest** — `scripts/build-texlive.sh` runs `docker build -t spektrum-texlive:dev docker/texlive` and prints `spektrum-texlive:dev sha256:…`. Expected: build succeeds (20–60 min, one time) and `docker run --rm spektrum-texlive:dev latexmk --version` prints a version. Assert the sandbox is actually read: `docker run --rm spektrum-texlive:dev sh -c 'test "$(kpsewhich -var-value openin_any)" = p && test "$(kpsewhich -var-value shell_escape)" = f'` must pass; record the values in Appendix A.
- [ ] **Step 3: Write the smoke script** at **`apps/web/scripts/compile-smoke.ts`** (not the repo root: `pnpm --filter @spektrum/web exec` runs with `apps/web` as cwd, and the root has no workspace links). It creates `WORK=$(mktemp -d)` and `OUT="$WORK/out"`, materialises `zenno/recon/extracted/example-main.tex` plus a **generated** `diagram.jpg` (the capture's example has `\includegraphics{...{diagram.jpg}}` at line 59; without it latexmk errors and the smoke test is meaningless — the committed fixture is added in Task 3, when `packages/latex` exists). Then run exactly what the worker will run — the §10.6 sandbox, not a plain `docker run`: create with a read-only root and tmpfs `/work`, copy the tree in, start attached, copy the outputs out, remove. A host bind mount is incompatible with `--read-only` + tmpfs `/work`, and the spec's sandbox wins.

```bash
WORK=$(mktemp -d); OUT="$WORK/out"
CID=$(docker create --name "spektrum-compile-$$" --network none --read-only \
  --tmpfs /tmp:rw,size=256m,mode=1777 --tmpfs /work:rw,size=512m,mode=1777 \
  --user 10001 --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 128 --memory 1g --cpus 1 -e TEXMFVAR=/tmp/texmf -e HOME=/tmp -w /work \
  spektrum-texlive:dev sh -c \
  'latexmk -interaction=nonstopmode -halt-on-error -file-line-error -synctex=1 \
   -no-shell-escape -pdf -outdir=/work/out main.tex; rc=$?; \
   texcount -total -merge -q main.tex > /work/texcount.txt; echo "$rc" > /work/latexmk.exit')
chmod -R a+rX "$WORK"                 # uid 10001 must read the copied tree
docker cp "$WORK/." "$CID:/work/"
docker start -a "$CID"                # the worker wraps this in a 30 s timeout
docker cp "$CID:/work/out" "$OUT"
docker cp "$CID:/work/texcount.txt" "$OUT/texcount.txt" 2>/dev/null || true
docker cp "$CID:/work/latexmk.exit" "$OUT/latexmk.exit" 2>/dev/null || true
docker rm -f "$CID"
```

- [ ] **Step 4: Run the smoke script and record the result** — `pnpm --filter @spektrum/web exec tsx scripts/compile-smoke.ts` (`tsx` is not on the root PATH; the root has no `@spektrum/*` links either); expected: `out/main.pdf`, `out/main.synctex.gz`, `out/texcount.txt` and `out/latexmk.exit` (contents `0`) exist, the PDF is ≤ 20 MB, and the wall time is printed. Record the timing in the ledger (`< 3 s` target; if the cold run exceeds it, proceed — Task 8 measures the full path and Task 2's Appendix A records the split).
- [ ] **Step 5: Commit** — `feat(texlive): add the compile image and a smoke compile`.

### Task 3: The log parser with captured fixtures

**Files:**
- Create: `packages/latex/{package.json,tsconfig.json,src/index.ts,src/parse-log.ts,fixtures/*.log}`, `apps/web/scripts/gen-latex-fixtures.ts` (it does not exist yet). The package declares `"@spektrum/shared": "workspace:*"` and `zod`; run `pnpm install` and commit the lockfile.
- Test: `packages/latex/src/parse-log.test.ts`

**Interfaces:**
- Consumes: `Diagnostic` from `@spektrum/shared`.
- Produces: `parseLog(raw: string): Diagnostic[]`.

- [ ] **Step 1: Generate the 12 fixtures** — add the 12 broken sources under `packages/latex/fixtures/src/<name>.tex` (Appendix B; `xelatex-unicode` is compiled with `-xelatex`, the rest with `-pdf`), then have `apps/web/scripts/gen-latex-fixtures.ts` (run with `pnpm --filter @spektrum/web exec tsx`) compile each inside `spektrum-texlive:dev`, copy each source to `main.tex` in its own temp dir (so every compile writes `out/main.log`), compile it, and copy `out/main.log` to `packages/latex/fixtures/<name>.log`. Expected: 12 non-empty logs. `timeout` and `partial-render` cannot come from a normal compile: synthesise them by truncating a real log at a `! LaTeX Error` block (`timeout` has no `l.<n>` line; `partial-render` stops after the first page's warnings).
- [ ] **Step 2: Write the failing tests** — one `it` per rule in spec §11.3, using the fixtures: `! LaTeX Error`, `! Emergency stop.`, `! Undefined control sequence.`, `file.tex:12:` prefix, `Overfull \hbox … at lines A--B` → warning at `A` with message `Overfull \hbox (Xpt too wide) detected at line A`, `Underfull \hbox`/`\vbox`, `LaTeX Warning:`, `Package xyz Warning:`, `Missing character:` → info, 79-column unwrapping (a line whose length is exactly 79 is joined with the next before matching), duplicate suppression by `(severity, message, file, line)`, `raw` carrying the original block, and `sanitizeDiagnosticPath` (Task 1) turning `./main.tex` into `main.tex` and a hostile `../x` into `x` without throwing.
- [ ] **Step 3: Run the tests and watch them fail** — `pnpm exec vitest run packages/latex` → FAIL.
- [ ] **Step 4: Implement `parseLog`** — unwrap at 79 columns first; match the rules in order; `file:line:` prefix wins over `l.<n>`; convert TeX's 1-based line to the model's 0-based (`line = n - 1`); normalise `file` with a **non-throwing** `sanitizeDiagnosticPath` in `@spektrum/shared/paths` (strip a leading `./`, drop `..` segments, replace `\`/control chars, cap the length) — `normalizeDocumentPath` throws on `../x.tex:12:`, which would fail the whole compile instead of producing a diagnostic; suppress duplicates; keep the multi-line block as `raw`.
- [ ] **Step 5: Run the tests and typecheck** — `pnpm exec vitest run packages/latex && pnpm typecheck` → PASS.
- [ ] **Step 6: Commit** — `feat(latex): parse TeX logs into diagnostics`.

### Task 4: Project stats (texcount-equivalent)

**Files:**
- Create: `packages/latex/src/stats.ts`, `packages/latex/fixtures/texcount/*.txt`
- Test: `packages/latex/src/stats.test.ts`

**Interfaces:**
- Consumes: `ProjectStats`; texcount output captured in the fixtures.
- Produces: `parseTexcount(output: string, sources: string[]): ProjectStats`.

- [ ] **Step 1: Capture the fixtures** — Task 2's container writes `/work/texcount.txt` (the worker copies it out with the PDF); run it for the example document and one multi-file document (with `\input`) and save the outputs under `packages/latex/fixtures/texcount/`. Do **not** use `-char` (letters, not words). Read the captured format before writing the regex (`-q` only silences errors; `-total` keeps the per-category lines).
- [ ] **Step 2: Write the failing test** — parse the captured output and assert the exact card values for the example document (words, words in text, words in headers, words outside text, headers), plus figures and math counts computed from the source (`figure`/`table` environments, `$…$`, `$$…$$`, `\(…\)`, `\[…\]`).
- [ ] **Step 3: Run and watch it fail** — `pnpm exec vitest run packages/latex/src/stats.test.ts`.
- [ ] **Step 4: Implement `parseTexcount`** — regex the texcount summary; texcount prints no total-words line, so `words = wordsInText + wordsInHeaders + wordsOutsideText` (assert that identity in the test); count figures by scanning **all** sources for `figure` environments only (the card is "Number of figures"; `table` is not a figure); take math from texcount's own `Number of math inlines`/`Number of math displayed` lines (a hand scanner double-counts `$$…$$` inside `$…$` and mishandles `\$`), and only fall back to a scanner when texcount omits them; return `ProjectStats` (0 when a field is absent).
- [ ] **Step 5: Run and commit** — tests PASS; `feat(latex): add compile-time project statistics`.

### Task 5: The SyncTeX parser

**Files:**
- Create: `packages/latex/src/synctex.ts`, `packages/latex/fixtures/synctex/example.synctex.gz`
- Test: `packages/latex/src/synctex.test.ts`

**Interfaces:**
- Consumes: `SyncTexMap`; the captured `.synctex.gz` from Task 2.
- Produces: `parseSyncTex(gz: Buffer, pages: Array<{ width: number; height: number }>): SyncTexMap`.

- [ ] **Step 1: Copy the captured map** — copy `out/main.synctex.gz` from Task 2's smoke run to the fixture path.
- [ ] **Step 2: Write the failing tests** — assert the forward map has an entry for `main.tex`; that a known editor line maps to a page and 0–1 fractions **given the page's `MediaBox` (the test pins `0 0 612 792` and an anchor at a known `sp` → a known fraction)**; that `backward` anchors are ordered by `y`; that changing the page height changes `y` but not `x` (the fractions are relative, so they are zoom-independent); and that a file with no SyncTeX records degrades to an empty map rather than throwing.
- [ ] **Step 3: Run and watch it fail** — `pnpm exec vitest run packages/latex/src/synctex.test.ts`.
- [ ] **Step 4: Implement `parseSyncTex`** — gunzip (`node:zlib`), apply the preamble (`Magnification`, `X Offset`, `Y Offset`; defaults 1000/0/0 — skipping them shifts every anchor), parse the `Input:`/`{`/`}` records, normalise each `Input:` path (strip the materialise root and a leading `./`, so `/work/main.tex` and `./main.tex` both become `main.tex`), and convert `sp` → TeX pt (`÷ 65536`) → PDF bp (`× 72 / 72.27`, **not** `72 / 65536`: 1 TeX pt is 1/72.27 in, and the 0.4 % error is ~3 bp on a 792 bp page) → page-relative fractions with **0 = top** (the client's click coordinates and the anchors must agree; state it in the parser's doc comment). **The `.synctex.gz` has no page size** (only a `Content:` section marker); the worker reads each page's `/MediaBox` from the compiled PDF with a regex over the raw bytes (no new dependency), verified against a real `pdflatex` output; if the page dictionary is compressed into an object stream, fall back to `pdfjs-dist/legacy/build/pdf.mjs` in the worker — **add `pdfjs-dist` (the same exact version) to `apps/worker` and run `pnpm install`** — and record which path the image needs. The page boxes are passed to the parser, so the parser stays unit-testable. Produce the exact `SyncTexMap` shape from spec §11.6.
- [ ] **Step 5: Run, typecheck, commit** — `feat(latex): parse SyncTeX maps for two-way sync`.

### Task 6: Storage package

**Files:**
- Create: `packages/storage/{package.json,src/index.ts}` (package name `@spektrum/storage`)
- Test: `packages/storage/src/index.test.ts` (against MinIO; skipped when `S3_ENDPOINT` is unset)

**Interfaces:**
- Produces: `putObject(bucket, key, body, contentType)`, `getObject(bucket, key)`, `getObjectRange(bucket, key, start, end): Promise<{ body: ReadableStream<Uint8Array>; size: number }>`, `deleteObject(bucket, key)` with `bucket: "pdf" | "uploads"` (renders in `spektrum-pdf`, blobs in `spektrum-uploads`; `bucket()` cannot express both).

- [ ] **Step 1: Write the failing test** — gate the suite on `process.env.STORAGE_IT === "1"` (a developer/CI run without MinIO must not fail `pnpm test`). With `docker compose -f docker/compose.dev.yml up -d minio createbuckets` running, `STORAGE_IT=1 pnpm exec vitest run --project storage` puts a small object, reads it back, reads a byte range (assert `size` is the full length, not the range length), deletes it, and asserts the bucket policy has no anonymous read → FAIL.
- [ ] **Step 2: Implement the client** — `@aws-sdk/client-s3` (exact version, pinned) with `forcePathStyle: true`, `region: "us-east-1"` (MinIO ignores it; the SDK requires one) and the `S3_*` env vars — use the `spektrum-pdf` bucket for renders and `spektrum-uploads` for blobs, both created by `docker/compose.dev.yml` (the `bucket` argument selects one); `S3_BUCKET` is optional in `env.ts`, so pass it explicitly; return `body.transformToWebStream()` so a route handler can return a web `Response`; throw a typed `StorageError` on a missing object so callers can map it to 404. Add `typescript`/`@types/node` dev deps, run `pnpm install`, and commit the lockfile; `deleteObject` is used by the Phase 5 retention job (kept now so the API is complete).
- [ ] **Step 3: Run the test and commit** — `feat(storage): add the S3-backed render store`.

### Task 7: The worker: queue, recovery and coalescing

**Files:**
- Create: `apps/worker/{package.json,src/index.ts,src/queue.ts,src/recover.ts}`
- Modify: `docker/compose.dev.yml` (no new service in dev; the worker runs with `pnpm --filter @spektrum/worker dev`)
- Test: `apps/worker/src/recover.test.ts`, `apps/worker/src/queue.test.ts`

**Interfaces:**
- Consumes: `CompileJob`, the `compile` queue, `pdfRenders`.
- Produces: `QUEUE_NAME = "compile"`, `connectRedis(): Redis` (BullMQ requires `maxRetriesPerRequest: null`; the repo's `getRedis()` uses `2` and cannot be reused), `recoverStaleRuns(db): Promise<number>`, and the exported `handler` (tests call it directly instead of a test-only `claimNext`).

- [ ] **Step 1: Write the failing recovery test** — insert a `running` row older than 2 minutes and a stale `compile-lock:<projectId>`, run `recoverStaleRuns`, assert the row becomes `error` with `log = "worker restarted"` and the lock is gone; a fresh `running` row and a fresh lock are untouched. `pnpm exec vitest run apps/worker/src/recover.test.ts` → FAIL.
- [ ] **Step 2: Implement recovery + the worker entry** — add `bullmq`, `ioredis` and `zod` at exact versions (the repo pins every dependency; `ioredis 6.0.0` is already in `packages/shared`), run `pnpm install` and commit the lockfile, then BullMQ `Worker(QUEUE_NAME, handler, { connection, concurrency: 2, attempts: 5, backoff: { type: "fixed", delay: 1000 } })`; on boot call `recoverStaleRuns`; on SIGTERM close the queue and exit 0. Per-project serialization with a Redis lock `compile-lock:<projectId>` (TTL 5 min, released in `finally`): poll `SET NX PX` for up to the 30 s container cap; if it is still held, **throw** `Error("locked")` (returning `{skipped:"locked"}` *resolves* the job, so BullMQ would drop it — only a rejected promise retries), with `attempts: 5` and a fixed 1 s backoff (≈ 2.5 min of cover for a 30 s compile plus its own retries). Recovery also deletes a lock older than 2 minutes, so a `SIGKILL` cannot wedge the project for the full TTL.
- [ ] **Step 3: Write the supersede test** — a job whose `revisionHash` differs from `compile:current:<projectId>` returns `{ skipped: "superseded" }` without touching the DB (the Redis key is the single source of truth; BullMQ has no cheap "newest job per project" query, so the earlier "newest queued revision" wording was unimplementable). `pnpm exec vitest run apps/worker/src/queue.test.ts` → PASS.
- [ ] **Step 4: Run and commit** — `feat(worker): add the compile queue, boot recovery and supersede check`.

### Task 8: The compile job

**Files:**
- Create: `apps/worker/src/{compile.ts,container.ts,materialise.ts,publish.ts}`
- Test: `apps/worker/src/compile.test.ts` (integration, requires the texlive image and MinIO)

**Interfaces:**
- Consumes: `CompileJob`, the project's document rows (`path`, `content`, `blobKey`), `revisionHash` from `@spektrum/shared/revision`, `normalizeDocumentPath` from `@spektrum/shared/paths` (moved there from `apps/web/src/lib/documents.ts`; the worker cannot import the web alias), `parseLog`, `parseSyncTex`, `parseTexcount`, `putObject`.
- Produces: `runCompile(job: CompileJob): Promise<{ status: "ok" | "error"; durationMs: number }>`.

- [ ] **Step 1: Write the failing integration test** — gate it on `RUN_COMPILE_IT=1` (the texlive image, MinIO and Redis are not present in the default CI test job; a gated suite keeps `pnpm test` green everywhere). It enqueues the example project's revision, runs `runCompile`, and asserts the `pdf_renders` row is `ok`, the PDF object exists in MinIO, `diagnostics` is `[]` for the **blank template** (the example document has an `Overfull \hbox`, so it is not the clean case), `durationMs` is a number, and a Redis `result` event was published.
- [ ] **Step 2: Implement materialise + container** — write every document row to a temp dir (`fs.mkdtemp`), resolving each path with `normalizeDocumentPath` and asserting the result stays inside the temp dir (a crafted `path` must not escape). A row with `content === null` is an S3 blob (images, large files): fetch it with `blobKey`; only `content` rows are written directly. **No worker-side fixture substitution**: if `diagram.jpg` is missing, the compile fails like any other missing input; the e2e/visual fixtures seed it as a real blob document. Then run the Task 2 sandbox (`docker create` → `chmod -R a+rX` → `docker cp` → `docker start -a` → `docker cp` the outputs **and `texcount.txt`/`latexmk.exit`** out → `docker rm -f`) with a **unique** container name (`spektrum-compile-${projectId}-${revisionHash.slice(0, 8)}-${randomUUID()}`; `concurrency: 2` means a fixed name collides) and a 30 s wall clock (`docker stop -t 5` then `docker rm -f`); on timeout return `error` with `Compilation timed out after 30s`. **Tolerate a missing `out/`** (latexmk can die before creating it): copy what exists, then produce the error row. Delete the PDF and return `error` if it exceeds 20 MB. Clean up in `finally`: `docker rm -f` the container (even after a timeout) and remove the `fs.mkdtemp` tree.
- [ ] **Step 3: Implement `runCompile`** — choose the program before the run: `% !TEX program = xelatex|lualatex|pdflatex` in the main file wins, else `pdflatex` (spec §11.2 step 4), and pass `-xelatex`/`-lualatex`/`-pdf` accordingly. **Re-read the revision before recording it**: after materialising, recompute `revisionHash` from the same rows and compare with `job.revisionHash`; on a mismatch mark the row `superseded` and return (the web route's hash could be stale — a save between the POST and the materialise). Treat a missing `compile:current:<projectId>` as “proceed” (`null` means no newer revision is known), not as superseded. Insert/update the `pdf_renders` row (`running`, `mainFile` — the column added in Task 1), publish `status: running`, stream stdout lines as `log` events (cap 200), read `latexmk.exit` to decide `ok`/`error` (the `sh -c` status is texcount's, not latexmk's), then parse the outputs of the **job basename** — `const job = path.basename(mainFile).replace(/\.[^.]+$/, "")`; latexmk writes `out/<job>.log`, `out/<job>.synctex.gz`, `out/<job>.pdf`, so a project whose main file is `paper.tex` produces no `out/main.log` — into diagnostics, the SyncTeX map and stats (from the `texcount.txt` the container wrote, copied out with the PDF); store the last 2 000 lines of `out/<job>.log` in `pdf_renders.log` (the Raw logs view); upload `pdf/<projectId>/<revision>.pdf` and `synctex/<projectId>/<revision>.json`; update the row to `ok` (or `error` with the tail of stderr); **publish `status: { state: "error", revision }` on the failure path** (otherwise the live tab stays on `Compiling…` until a reload) and `result` on success (with the route-relative `pdfUrl`, diagnostics, stats, durationMs). If the revision already has an `ok` row, return it without a container (spec §11.2 step 2). Before writing the row, re-check `compile:current:<projectId>`; if it no longer equals `job.revisionHash`, mark the row `superseded` and write nothing (a newer revision won).
- [ ] **Step 4: Test the failure path** — compile a document with a deliberate error; assert the row is `error`, `diagnostics` contains the error at the right line, and no PDF object is written. Add the test to `compile.test.ts`.
- [ ] **Step 5: Run the integration test and commit** — `pnpm exec vitest run apps/worker` → PASS; `feat(worker): run latexmk in the texlive container and record the render`.

### Task 9: Render reads: PDF stream, SyncTeX, latest

**Files:**
- Create: `apps/web/src/lib/render-store.ts`, the five route files listed in the File Structure (including `render/[revision]/log`)
- Modify: `apps/web/package.json` (add `@spektrum/storage`)
- Test: `apps/web/src/lib/render-store.test.ts` (route-level, ownership + Range)

**Interfaces:**
- Consumes: `getObject`, `getObjectRange`, `requireUser`, `getProject`, `listRevisionDocuments`, `revisionHash` (for `isCurrent`).
- Produces: `GET /api/projects/:id/render/:revision/pdf` (206 for `Range`, `Content-Type: application/pdf`, `Accept-Ranges: bytes`, `Content-Length`, `Content-Range`), `GET .../synctex`, `GET .../render/:revision/log` → `{ log }`, `GET .../render/latest` → `{ render }` where render is `{ revision, status, mainFile, stats, diagnostics, durationMs, createdAt, pdfUrl, lastOkRevision, isCurrent }` — all fields on `render` (no envelope ambiguity); `pdfUrl`/`lastOkRevision` point at the **last `ok` render**, not the newest row (a failed compile must still show the previous PDF after a reload, spec §11.2); `isCurrent` is `render.revision === revisionHash`. `GET .../render/:revision/pdf` 404 for another owner. **`revision` is 64 hex chars, not a UUID**: validate with `/^[0-9a-f]{64}$/`, while `projectId` uses the existing `UUID_RE`.

- [ ] **Step 1: Write the failing tests** — mock `@spektrum/storage` (the unit job has no MinIO) and assert: (a) the owner gets 200 and the bytes; (b) `Range: bytes=0-99` → 206 with 100 bytes, `Content-Length: 100` (the range length, not the object size; assert the header value, not the runtime's normalization), `Content-Range: bytes 0-99/<size>`, `Accept-Ranges: bytes`; (c) a second user gets 404; (d) an unknown revision gets 404; (e) a 64-hex revision is accepted and a UUID-shaped one is rejected; (f) the latest route returns the newest row **and the last `ok` row's `pdfUrl`**; (g) the log route returns the stored tail.
- [ ] **Step 2: Run and watch them fail** — `pnpm exec vitest run apps/web/src/lib/render-store.test.ts`.
- [ ] **Step 3: Implement the routes** — `UUID_RE` for `projectId`, `REVISION_RE = /^[0-9a-f]{64}$/` for `revision`; verify ownership; then stream from S3 (do not redirect — the bytes stay auth-checked). A separate `STORAGE_IT=1` test exercises the real MinIO range path.
- [ ] **Step 4: Run, typecheck, commit** — `feat(render): serve the PDF, SyncTeX map and latest render behind ownership checks`.

### Task 10: The SSE stream and the compile trigger

**Files:**
- Create: `apps/web/src/app/api/projects/[projectId]/compile/route.ts`, `.../render/stream/route.ts`, `apps/web/src/lib/compile-queue.ts` (the web-side BullMQ `Queue`, queue name + default job options; `apps/web` gains `bullmq` and `pnpm install`), `apps/web/src/lib/compile-client.ts`, `apps/web/src/lib/render-client.ts`
- Modify: `editor-client.tsx` (the `onSaved` handler already exists in `use-autosave.ts:30,76`; wire the compile there), `apps/web/src/app/api/projects/[projectId]/documents/[documentId]/route.ts` (publish `conflict` on the 409 path), `apps/web/src/app/(app)/u/[projectId]/editor-client.test.tsx` (it stubs `fetch` globally; add a compile-route mock)
- Test: `apps/web/src/lib/compile-client.test.ts` (SSE parser, `EventSource` fake)

**Interfaces:**
- Consumes: `CompileJob`, `RenderEvent`, `revisionHash`, `listRevisionDocuments`, `pdfRenders`.
- Produces: `POST /api/projects/:id/compile` body `{ mainFile }` → `202 { revision }` (or `200 { revision, cached: true }` when the revision already has an `ok` row), enqueued through `compile-queue.ts` (`QUEUE_NAME` defined once there; a test asserts the worker's constant matches); `GET .../render/stream` emits `event: status|log|result|conflict`; `useRenderStream(projectId)` returns the latest `RenderEvent` state.

- [ ] **Step 1: Write the failing SSE test** — a fake Redis publisher emits `status`, `log`, `result`, `conflict`; the parser yields the events in order; a malformed `data:` line is ignored, not thrown. `pnpm exec vitest run apps/web/src/lib/compile-client.test.ts` → FAIL.
- [ ] **Step 2: Implement the route + hook** — a `ReadableStream` (`Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; `export const dynamic = "force-dynamic"`; **no `runtime` export** — Next 16 defaults to Node and the docs say to remove it). Send an initial `status` from the latest row; subscribe with `getRedis().duplicate()` (a subscriber connection cannot issue normal commands) to `render:<projectId>`; heartbeat `: ping\n\n` every 15 s; unsubscribe and abort on `req.signal`. The hook uses `EventSource` and falls back to the latest-render route on error.
- [ ] **Step 3: Wire the triggers** — first move the RSC prop change here: `page.tsx` passes `mainDocumentId` (as a path) and `initialRender` (from Task 9's latest route) to `EditorClient`, and `EditorClientProps` gains both; update `editor-client.test.tsx`'s props. Compile when: an autosave completes and `realtimeCompilation` is on and the buffer is clean; `Cmd/Ctrl+S`; the **tab-strip recompile button** (`onRecompile` in `editor-client.tsx:377`, currently a no-op; the PDF-bar `Refresh` lands in Task 12); project open (mount, when `initialRender.isCurrent` is false); toggling realtime compilation on. The body is `{ mainFile }`, resolved from the project's `mainDocumentId` path (the route 404s if the path is not a document of the project). Before enqueueing, `await consume("compile:" + user.id, BUDGETS.compile)` (429 + `Retry-After`) and set `compile:current:<projectId>`. Suppress while the buffer is dirty and show `Unsaved changes` instead. Before enqueueing, set the Redis key `compile:current:<projectId>` to the revision; the worker discards a finished compile whose revision is no longer current (Appendix E, D50). On an autosave conflict (409) the **PATCH route** publishes `conflict { revision, documentId }` (the revision recomputed from the persisted documents) on the project channel; the client ignores an event for a document it just saved or whose buffer is dirty (the winner must not be reloaded), and the tab that did **not** save reloads that document at the same cursor (spec §11.0) — e2e: two tabs, edit in one, assert the second tab reloads the winner's content at the same line. Also add the §10.5 hourly budget (`compileHourly`, 60/h) with a 429 and a visible notice, next to `BUDGETS.compile` (6/min).
- [ ] **Step 4: Run and commit** — `feat(compile): enqueue compiles, stream progress and signal conflicts`.

### Task 11: PDF viewer core

**Files:**
- Create: `apps/web/src/components/pdf/{pdf-viewer.tsx,use-pdf-document.ts}`, `public/pdf.worker.min.mjs` (copied), `scripts/copy-pdf-worker.mjs`
- Modify: `apps/web/package.json` (`pdfjs-dist` exact version; `dev`/`build` chained explicitly with the copy script — pnpm's pre/post default varies), `apps/worker/package.json` (`pdfjs-dist` for the MediaBox fallback), `.gitignore` (the copied worker), `editor-client.tsx` (replace `PdfPane` with the viewer)
- Test: `apps/web/src/components/pdf/use-pdf-document.test.ts` (document loading, page count, failure → null)

**Interfaces:**
- Consumes: the render stream's `pdfUrl` and `revision`; `pdfjs-dist`.
- Produces: `<PdfViewer pdfUrl revision zoom pageCount onPageChange />` rendering one canvas per visible page, re-rendering on zoom/DPR change, and exposing the page count upward.

- [ ] **Step 1: Pin `pdfjs-dist`** — install the current release, record the exact version in Appendix E (like `monaco-editor 0.57.0`), and do not use a range. Then decide the worker loading path — a throwaway check that `GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"` works with Next 16 + Turbopack; if the bundler path fails, use `new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" })`. Record the chosen path in Appendix E. Chain the copy explicitly (`"dev": "node scripts/copy-pdf-worker.mjs && next dev"`, `"build": "node scripts/copy-pdf-worker.mjs && next build"`), and run `pnpm install` after adding `pdfjs-dist`.
- [ ] **Step 2: Write the failing test** — `use-pdf-document.ts` itself imports `pdfjs-dist/legacy/build/pdf.mjs` (the browser build throws `DOMMatrix is not defined` at module scope in the Node test project); the test mocks the module and asserts the hook's state machine, plus a direct load of the fixture PDF asserting `numPages`. Canvas rendering is asserted in `e2e/pdf.spec.ts` (real Chromium), not here.
- [ ] **Step 3: Run and watch it fail** — `pnpm exec vitest run apps/web/src/components/pdf`.
- [ ] **Step 4: Implement the viewer** — virtualise by page with an `IntersectionObserver`; render at `devicePixelRatio`; cancel in-flight renders on zoom; white sheet, `--bg-preview` page background, `0 1px 3px rgb(0 0 0 / .3)`; clean up the document and observers on unmount.
- [ ] **Step 5: Replace the placeholder** — delete the inert body of `pdf-pane.tsx` and mount `<PdfViewer>`; keep the `data-testid="pdf-pane"` wrapper and the `Initializing...` state for the no-render case. The two Phase 2 editor baselines (`editor--dark--blank`, `editor--light--blank`) now legitimately show a real PDF and will fail until Task 17 re-shoots them — expected, not a regression.
- [ ] **Step 6: Run, typecheck, commit** — `feat(pdf): render the compiled PDF with pdfjs`.

### Task 12: PDF chrome and search

**Files:**
- Create: `apps/web/src/components/pdf/{pdf-chrome.tsx,pdf-search.tsx}`
- Test: `apps/web/src/components/pdf/pdf-chrome.test.tsx` (menus, page input), `e2e/pdf.spec.ts` (search)

**Interfaces:**
- Consumes: `PdfViewer` page state, the render state, `pdfZoomShortcuts`, `pdfDarkMode`.
- Produces: the header card with `Compiled/Compiling…/Failed` pill + popover (duration, main file), page input `NN of MM`, zoom menu (fit, in/out, 50–400 %), `⋯` menu (fullscreen, open in new window, screen reader mode), download; the floating bar (`refresh`, collapse, `Go to PDF`) that hides after 2 s; the search pill.

- [ ] **Step 1: Write the failing component tests** — the pill maps every status: `queued`/`running`/`superseded` → `Compiling…`, `ok` + `isCurrent` → `Compiled`, `ok` + stale → `Compiled` (the PDF is from an older revision) with the popover naming the revision, `error` → `Failed`, dirty buffer → `Unsaved changes`; the page input clamps to `1..numPages`; the zoom menu lists the exact values from §8.1; the search pill opens on `Cmd/Ctrl+F` and closes on `Esc`; typing in the pill does not reach the editor; `pdfDarkMode` puts `filter: invert(1) hue-rotate(180deg)` on the canvas layer (not the chrome); `pdfZoomShortcuts` gates a `keydown` handler for `Ctrl+0`/`Ctrl+Plus`/`Ctrl+Minus` (off → the browser default stands).
- [ ] **Step 2: Run and watch them fail** — `pnpm exec vitest run apps/web/src/components/pdf`.
- [ ] **Step 3: Implement the chrome** — exact copy from Appendix C; icons from `@spektrum/ui/icons`; `aria-label`s; the pill's popover; `fullscreen` via the Fullscreen API; `window.open` for the new window; the screen-reader text layer toggle.
- [ ] **Step 4: Implement the search pill and the PDF preferences** — `#353535`, `--radius-3xl`, `--shadow-surface`, right-aligned below the chrome; extract page text with `getTextContent()`, find hits, draw `--notification-border-warning` rects; no next/previous buttons, no count inside the pill. Add the canvas-layer inversion for `pdfDarkMode` and the gated zoom shortcuts, plus the PDF-bar `Refresh` (Task 10's tab-strip button is separate).
- [ ] **Step 5: Run, typecheck, commit** — `feat(pdf): add the viewer chrome and search overlay`.

### Task 13: SyncTeX two-way sync

**Files:**
- Create: `apps/web/src/components/pdf/{use-sync-scroll.ts,use-sync-jump.ts}`, `apps/web/src/lib/synctex-client.ts`
- Test: `apps/web/src/components/pdf/use-sync-jump.test.ts` (nearest-anchor hit test)

**Interfaces:**
- Consumes: `SyncTexMap`, the editor's cursor line, `MonacoEditorProps` (add `onCursorChange(line: number)`; `apps/web/src/editor/monaco-editor.tsx` is in this task's Files), `MonacoEditorHandle` (add `revealLine(line: number)`), the PDF page geometry. **Boundaries**: SyncTeX lines are 1-based per file; `revealLine` is 1-based; the model's diagnostics are 0-based. Convert once, at each edge.
- Produces: forward: on cursor move (120 ms debounce) scroll to `{page,x,y}` and flash the line rect (`--bg-preview-hover-inverted`, 900 ms fade); backward: double-click a PDF line → `revealLine` + set position; if the map is missing, both are disabled (no throw).

- [ ] **Step 1: Write the failing hit-test** — anchors at `y = 0.2, 0.5, 0.75` on page 2 (asymmetric, so a top/bottom flip cannot pass); a click at `0.55` picks the `0.5` anchor and maps to its `path`/`line`; a click above the first anchor picks the first; an empty map returns `null`.
- [ ] **Step 2: Run and watch it fail** — `pnpm exec vitest run apps/web/src/components/pdf/use-sync-jump.test.ts`.
- [ ] **Step 3: Implement both hooks** — fetch `…/render/:revision/synctex` once per revision, using `render.lastOkRevision` (a failed compile has no map at the error revision); forward: `forward[activePath]` → the nearest entry by line; backward: nearest anchor by `y` within the page. Guard `path` normalization (the map's paths are project-relative, same as the editor's).
- [ ] **Step 4: Run, typecheck, commit** — `feat(pdf): sync the editor and the PDF both ways`.

### Task 14: Logs panel and the Info panel shell

**Files:**
- Create: `apps/web/src/components/info-panel/{info-panel.tsx,logs.tsx}`
- Modify: `editor-client.tsx` (panel state, trigger), `apps/web/src/app/(app)/u/[projectId]/page.tsx` (pass `initialRender`)
- Test: `apps/web/src/components/info-panel/logs.test.tsx`, `e2e/info-panel.spec.ts`

**Interfaces:**
- Consumes: `Diagnostic[]`, the render state, `revealLine` from Task 13.
- Produces: a `Tools` menu (the existing `tools` prop at the tab row's right edge, `editor-client.tsx:378-390` — the 16 px icon strip is a separate empty div and its icon is undetermined) whose items are `Project Info`, `Versions`, `Comments`, `Logs`, `Share`, `Export` (Export is rendered disabled — Phase 5, Appendix D); selecting one replaces `<PdfPane />` with `<InfoPanel>` in the right pane (spec §6.3: **exactly one of** PDF/info, the Tools menu switches it, closing returns to the PDF; the pane is 677 px, not an overlay). `<InfoPanel>` has the four tabs in capture order (`Project Info`, `Versions`, `Comments`, `Logs`), a 44 px tab bar, `--border-brand` underline, close button; the Logs filter menu (`Warnings and Errors`, `Warnings only`, `Errors only`, `Raw logs`); each entry card with severity rule/icon, message, `file:line`, and a disabled `Fix with AI`; clicking the card calls `revealLine(line)`.

- [ ] **Step 1: Measure the panel from the captures** — open `~/Pictures/Screenshots/screenshot-2026-11-05_21-26-13-google-chrome.png` (Project Info) and `…21-26-50…png` (Logs), and record the tab height, tab labels/order and card padding in Appendix A. The panel is the right pane, **677 px** (measured: x 1748→2513 physical at DSF 1.13); if the capture disagrees, use the capture and note it before building.
- [ ] **Step 2: Write the failing tests** — the default filter is `Warnings and Errors`; `Errors only` hides warnings; `Raw logs` shows the monospace tail on `--bg-code`; a card click calls `revealLine` with the 1-based line converted back to the editor's line; the empty state renders when there is no render at all (Project Info shows zeroed cards, Logs shows `No errors or warnings` from Appendix C); `Raw logs` fetches `…/render/:revision/log` lazily, not with the project payload; the header `Fix all with AI` button exists and is disabled.
- [ ] **Step 3: Run and watch them fail** — `pnpm exec vitest run apps/web/src/components/info-panel`.
- [ ] **Step 4: Implement the panel** — wire the `Tools` menu; selecting `Project Info`/`Versions`/`Comments`/`Logs` renders `<InfoPanel>` **instead of** `<PdfPane />` (the grid sibling at `editor-client.tsx:430`), at the right pane's 677 px; `Escape`/the close button returns to the PDF; the panel state survives a tab switch but not a reload. Make the right pane resizable 360–900 px by reusing `useResizablePane` (D37: the resize arrives with the Phase 3 viewer), persisting the width under its own key. A Logs card with a `file` opens that document before `revealLine`; a diagnostic without a file only moves the cursor.
- [ ] **Step 5: Run, typecheck, commit** — `feat(info-panel): add the panel shell and the Logs tab`.

### Task 15: Project Info, Versions, Comments and Share

**Files:**
- Create: `apps/web/src/components/info-panel/{project-info.tsx,versions.tsx,comments.tsx,share-dialog.tsx}`, `packages/db/src/snapshots.ts` (+ `"./snapshots": "./src/snapshots.ts"` in `packages/db/package.json`), `apps/web/src/app/api/projects/[projectId]/snapshots/route.ts`, `.../snapshots/[snapshotId]/restore/route.ts`
- Modify: `apps/worker/src/compile.ts` (snapshot after a successful compile), `packages/db/src/schema.ts` (no change; the table exists)
- Test: `apps/worker/src/compile.test.ts` (the snapshot hook, which only the worker executes), `packages/db/src/snapshots.test.ts` (prune/restore/ownership — the logic lives in `@spektrum/db/snapshots`, which both the worker and the web routes import), `apps/web/src/components/info-panel/versions.test.tsx`

**Interfaces:**
- Consumes: `ProjectStats` (from the `result` event), `snapshots` table, `documents`.
- Produces (from `@spektrum/db/snapshots`): `snapshotAfterCompile(projectId)` — the author is `projects.ownerId` (v1 is single-owner; `snapshots.author_id` is `NOT NULL` and `CompileJob` has no user, so reading the owner avoids a contract change). **Only documents with non-null `content`** are snapshotted: `snapshots.content` is `NOT NULL` and a blob document would insert an empty string, so `diagram.jpg` is skipped (record this in Appendix D); `restoreSnapshot` writes `content` back and leaves `blobKey` untouched. `changedPaths` is computed inside by comparing `sha256(content)` with the newest snapshot's content hash for that document; only differing documents are inserted (spec §9.2 "when content changed"). `pruneSnapshots(projectId, keep = 50)` keeps the newest **50 snapshot rows per project**, `ORDER BY createdAt DESC, id DESC` so ties are deterministic. `listSnapshots(projectId, userId)` (rows + the author's display name for the avatar), `restoreSnapshot(userId, projectId, snapshotId)`, `GET /snapshots`, `POST /snapshots/:id/restore`.

- [ ] **Step 1: Write the failing snapshot tests** — in `apps/worker/src/compile.test.ts`: after a successful compile, one snapshot per changed document, authored by the project owner; a second compile with no change creates none. In `packages/db/src/snapshots.test.ts`: the 51st row deletes the oldest (deterministic tie-break), restore writes the snapshot content back and bumps `updatedAt`, another owner's restore is 404.
- [ ] **Step 2: Run and watch them fail** — `pnpm exec vitest run apps/worker/src/compile.test.ts packages/db/src/snapshots.test.ts`.
- [ ] **Step 3: Implement the snapshot logic + routes** — snapshot rows for one compile get `createdAt + i ms` (i = row index) so “oldest” is deterministic (`ORDER BY createdAt DESC, id DESC` with identical timestamps and random UUIDs is arbitrary); the Versions list groups rows by `createdAt` (one compile = one row, even when it snapshotted several documents), groups by day and labels each row `Edited workspace` with the relative time; `Restore` restores **every document in that compile group** (a new `restoreSnapshots(projectId, createdAt)` next to the single-document `restoreSnapshot`), returns the updated documents, and the client calls `router.refresh()` and closes the panel (the buffer/baseline reload comes from the RSC).
- [ ] **Step 4: Implement the three tabs + Share** — Project Info: a `Summary` heading (14/20 weight 500) then the 3-column card grid (cards `--bg-sidepanel-secondary`, `--radius-lg`, 12 px padding) with the eight cards from `ProjectStats` (11/14 tertiary labels, 20/28 values; zeroed when no render exists); Versions: 28 px thumbnail, title `Edited workspace`, relative time, `⋯` menu with `Restore`, a 28 px author avatar with a red ring, footer `Showing N of M versions`; Comments: filter dropdown + search + `No comments yet`; Share: 480 px dialog, email + disabled `Invite` with helper `Sharing arrives in v2`, `People with access`, `Only invited users` disabled, `Copy link` + `Done`; open it from the `Tools` menu (`Tools` → `Share`), not the project menu.
- [ ] **Step 5: Run, typecheck, commit** — `feat(info-panel): add project info, versions, comments and share`.

### Task 16: Behavioural e2e and the performance gate

**Files:**
- Create: `e2e/compile.spec.ts`
- Create: `playwright.compile.config.ts` (its own `globalSetup`, `webServer` and timeout; **not** a change to `playwright.config.ts`, whose config-level `globalSetup` would force Docker/MinIO on the blocking `e2e` job), `apps/web/src/cli/e2e-seed.ts` (owner, example project + documents, the `diagram.jpg` blob upload, the second user with a real Argon2 hash)
- Modify: `e2e/helpers.ts` (`login(page, { email, password })` — the cross-owner case needs a second account), `apps/web/package.json` (the `e2e:seed` script)
- Test: the spec itself

**Interfaces:**
- Consumes: the whole pipeline; the example document from `zenno/recon/extracted/example-main.tex`.

- [ ] **Step 1: Write the failing specs** — the compile config's global setup runs `apps/web/src/cli/e2e-seed.ts` (via `pnpm --filter @spektrum/web exec tsx`), then starts `pnpm --filter @spektrum/worker dev` (the behavioural `webServer` only starts Next; the worker, Redis, MinIO and the texlive image are prerequisites) and tears it down. The spec seeds the example project **with its `diagram.jpg` blob** (a document row whose `blobKey` points at an object the setup uploads with `@spektrum/storage` from an `apps/web` CLI, not a root script — the root has no workspace links), and creates the second user by inserting `users` + `accounts` with the same Argon2 hash helper `apps/web/src/lib/actions.test.ts` uses (an e2e spec cannot import that Vitest module). (a) open a project → warm the pipeline with one compile, then measure the second from the **last keystroke** (`Date.now()` immediately before `keyboard.type`, to the `result` event), assert `< 3000` (the cold first compile is not the gate; the split — debounce, PATCH, queue, compile — goes in Appendix A); (b) a deliberate error puts an error card in Logs and clicking it moves the cursor to the right line; (c) a newer edit supersedes the running compile (the final PDF matches the newest revision); (d) a failing compile keeps the last good PDF and the pill reads `Failed`; (e) another user's render URL is 404 — sign in as the seeded second user (the un-signed request would be 401, not 404), then request the first owner's render URL; (f) a 20-page document (the example with `\newpage` + a paragraph repeated to 20 pages) compiles in < 8 s (spec §15.3's second budget; commit the generator with the fixtures); (g) the two-tab conflict: edit in tab A, then in tab B, and assert the non-saving tab reloads the winner's content at the same cursor (the event carries `documentId`; the winner is not reloaded). Observe it through the DOM (`monaco-editor` text + the cursor line), not the SSE stream — Playwright does not surface events.
- [ ] **Step 2: Run and watch them fail** — `pnpm exec playwright test --config playwright.compile.config.ts e2e/compile.spec.ts` (serial, `workers: 1`).
- [ ] **Step 3: Implement whatever the tests expose** — no new features; fix the pipeline until all seven pass twice in a row (the timing test is the release gate; record both runs in the ledger).
- [ ] **Step 4: Run the full behavioural suite** — `pnpm exec playwright test e2e` → all green.
- [ ] **Step 5: Commit** — `test(compile): pin the <3 s gate, supersede, failure and ownership`.

### Task 17: Visual baselines and CI

**Files:**
- Create: `e2e/visual/pdf.spec.ts`, `e2e/visual/logs.spec.ts`, `e2e/visual/info-panel.spec.ts`
- Modify: `apps/web/src/cli/visual-seed.ts` (a new `pdf` dataset: the example `main.tex`, the `diagram.jpg` blob, an `ok` render and a committed PDF fixture, seeded **before** the `isEditor` early exit), `e2e/visual/fixtures.ts` (call `visual:seed pdf` inside the per-test seed — `visual-seed.ts` deletes every project, so a global seed is cascaded away), `e2e/visual/compare.ts` (the sheet mask), `playwright.visual.config.ts` (`S3_*` env; the visual `webServer` runs `next start`, so the build step must run first), `e2e/visual/accessibility.spec.ts` (the new screens), `e2e/baselines/reference/*` + `e2e/baselines/README.md`, `.github/workflows/ci.yml` (a `compile` job; MinIO + a build for `visual`)
- Test: the specs themselves

**Interfaces:**
- Consumes: `compareAgainstReference`, `VISUAL_BUDGET` (0.0015), `seedEditorFixture`.

- [ ] **Step 1: Measure the panel geometry** — open `~/Pictures/Screenshots/screenshot-2026-11-05_21-26-13-google-chrome.png` and `…21-26-50…png`, record the Info panel width, tab height and card metrics in Appendix A; adjust Task 14/15 if they differ.
- [ ] **Step 2: Write the cases** — `pdf--dark--compiled` (capture 18), `logs--dark--default`, `logs--dark--filter-menu` (29–30), `pdf--dark--more-menu`, `pdf--dark--zoom-menu` (31–32), `editor--light--context-menu` (40), `pdf--light--search` (41), and the §15.1 info-panel set: `info--dark--project-info`, `info--dark--versions`, `info--dark--comments` (23–28), `share--dark` (35) — the panel is 677 px and replaces the PDF pane (Task 14). The Versions rows show relative times and the Project Info cards show word counts, so those regions are masked (like the row thumbnails). Also mask the **page indicator** (`NN of MM` — our pagination differs from the capture) and, in the two Phase 2 editor baselines, the pill/top bar (it changes from `Initializing...` to a real status); record each mask. Each case seeds the `pdf` dataset (the example document + blob + `ok` render), with `revision_hash` computed by `revisionHash()` over the seeded documents (a hard-coded hash makes `isCurrent` false and the pill renders the wrong state) and its PDF already in MinIO. The upload lives in `apps/web/src/cli/visual-seed.ts` (where `@spektrum/storage` resolves) and is called from `e2e/visual/fixtures.ts` **inside the per-test seed**, after the project insert. `S3_*` must be in the **test process** env (the `webServer` env does not reach it) and in the CI `visual` job; the compose stack must be up; no worker is needed for a visual diff. Commit the rendered PDF under `e2e/visual/fixtures/` (the smoke output lives in a temp dir).
- [ ] **Step 3: Run and watch them fail** — `pnpm test:visual` → FAIL (no baselines yet); `compare.ts` writes `actual.png` and `diff.png` under `e2e/visual/artifacts/<name>/`.
- [ ] **Step 4: Generate the baselines from the captures, not from our render** — `compare.ts` crops the reference to the app region at diff time (`cropToAppRegion`), so a reference is the **full 2530×1380 capture**: copy the source file from `~/Pictures/Screenshots/` to `e2e/baselines/reference/<name>.png` exactly as Phase 1/2 did. **`actual.png` is written after `maskPng` (`compare.ts:142,157`), so it has black rectangles and must never become a reference**; it is only for a regression-only baseline with no capture (none here). Add the mapping row to `e2e/baselines/README.md` with the source capture and the sheet mask, and update the stale sentence "Phase 2 editor baselines show Prism's pre-compile state" — after Step 5 they show the real viewer. Also fix the two stale row labels there: `editor--dark--blank` is capture `21-28-32` (row 37, not 18), and `editor--light--blank` is the second light capture, not row 40. **Mask the PDF sheet** in every new baseline that shows it (18, 31–32, 41, and the two editor baselines): our texlive render can never match Prism's PDF pixels (different engine, fonts, pagination), so the sheet would dominate the diff and the case would measure nothing. The chrome, toolbar, popovers and search pill stay gated; record the sheet rectangles in the README's mask table (full-capture physical coordinates). Re-run and record the ratios in Appendix A (the budget is a measurement, not a gate). Reconcile §15.1's "no-reference" list with reality in the README: it names the Logs filter menu, but §2.1 row 30 **is** a capture, so this plan gates it; the other entries on that list stay hand-reviewed.
- [ ] **Step 5: Mask the two Phase 2 editor baselines instead of re-shooting them** — the real viewer replaces the `Initializing...` placeholder, so their sheet changes; add the sheet to their mask table (the captures stay the reference for the chrome, and the baselines do not become self-referential). Note the change in the ledger.
- [ ] **Step 6: Extend the icon/a11y walk** — `e2e/visual/accessibility.spec.ts` walks the rendered DOM of every screen; add the PDF and Logs screens (no emoji, `viewBox="0 0 16 16"`, `currentColor`, no `dangerouslySetInnerHTML` outside the sanitised text layer).
- [ ] **Step 7: Add the CI job and verify the workflow** — `.github/workflows/ci.yml` has no MinIO and the e2e job's `docker exec spektrum-postgres` calls assume a local compose stack (a pre-existing CI gap). Add a `compile` job: `docker compose -f docker/compose.dev.yml up -d`, build/cache the texlive image, **create and migrate `spektrum_test`** (compose only creates `spektrum`), seed the e2e DB and owner, export `S3_*` to every process (Next, the worker, the seed and the compile config's global setup), start the worker, run `playwright.compile.config.ts`. The `visual` job also needs MinIO (or compose) and a `pnpm build` before `next start`, plus `S3_*` in `playwright.visual.config.ts`; it stays `continue-on-error: true`, so say so rather than implying the new baselines gate. Locally run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` and the full `pnpm test:e2e` (the full suite in CI needs the `docker exec` helper replaced by a `DATABASE_URL` query — record that as a follow-up, not this phase's scope).
- [ ] **Step 8: Commit** — `test(visual): add the Phase 3 PDF and Logs baselines`.

---

## Appendix A — Evidence to record

- The texlive image digest and the smoke compile time (Task 2).
- The full compile path timing split: queue wait, container start, latexmk, upload (Task 8/16).
- The Info panel geometry measured from captures 23–30 (Task 17).
- The MediaBox used for SyncTeX fractions and one worked example (Task 5).
- The timing measurement's exclusions (Task 16): the gate starts at the autosave `PATCH` response, so it excludes the 400 ms debounce and the save RTT; record both so the number is not mistaken for §15.3's keystroke metric.
- The Phase 3 visual ratios, including the re-shot Phase 2 editor baselines.

## Appendix B — Log fixtures (12)

`clean`, `one-error`, `missing-package`, `overfull-hbox`, `underfull-vbox`, `undefined-control-sequence`, `latex-warning`, `package-warning`, `xelatex-unicode`, `bibtex-failure`, `timeout`, `partial-render`. Each is generated by compiling a deliberately broken document in the texlive image (`scripts/gen-latex-fixtures.ts`) and committed under `packages/latex/fixtures/`.

## Appendix C — Copy sheet (verbatim)

- Status pill: `Compiled`, `Compiling…`, `Failed`, `Unsaved changes`.
- Logs filters: `Warnings and Errors`, `Warnings only`, `Errors only`, `Raw logs`.
- Log entry: `Overfull \hbox (9.89099pt too wide) detected at line 75` / `main.tex:75`.
- Project Info cards: `Words`, `Words in Text`, `Words in Headers`, `Words outside text`, `Number of headers`, `Number of figures`, `Number of math inlines`, `Number of math displayed`.
- Versions: `Edited workspace`, `Showing 1 of 1 versions`, `Restore`.
- Comments: `All Comments`, `Only Unresolved`, `Only Resolved`, `Your Comments and Mentions`, `No comments yet`.
- Share: `Share "Project name"`, `Invite`, `People with access`, `General access`, `Only invited users`, `Copy link`, `Done`, `Sharing arrives in v2`.
- PDF: `Zoom to fit`, `Zoom in`, `Zoom out`, `50 %`…`400 %`, `Fullscreen`, `Open in new window`, `Show screen reader mode`, `Go to PDF`, `NN of MM`.
- Project Info: `Summary` heading (the capture's label for the card grid).
- Empty Logs: `No errors or warnings` (the capture has no empty Logs state; this is a recorded decision, not verbatim copy).

## Appendix D — Explicitly deferred

| Item | Phase | Why |
|---|---|---|
| `Fix with AI`, `Fix all with AI` | 4 | The AI proxy does not exist; render the buttons disabled |
| Comment creation | v2 | §9.3 says the panel exists with an empty state in v1 |
| Real sharing / invites | v2 | §9.5: `Sharing arrives in v2` |
| Import/export | 5 | §13 |
| Production TeX image registry | 5 | CI builds and caches the image; the digest is pinned here |
| Vim mode | post-v1 | Phase 2 D42 (monaco-vim cannot resolve against monaco-editor 0.57) |
| PDF text selection/copy | v1.x | Search and SyncTeX ship; selection is not in the captures |
| Project-level TeX program setting | post-v1 | Spec §11.2 step 4 mentions it, but no schema column and no §9.6 row exist; the magic comment and the `pdflatex` default ship |
| Sign-in / project-row-menu baselines | Phase 1 debt | §15.1 gates them; `e2e/baselines/reference` has the row menu but no sign-in baseline. Not Phase 3's scope; fix in a Phase 1 follow-up |

## Appendix E — Decision log additions

- **D44 — Render bytes stream through the web app, not presigned URLs.** The PDF and SyncTeX routes verify ownership and pass `Range` through to S3. A presigned URL would hand a bearer token to the browser (and to anything that logs URLs); streaming keeps every byte auth-checked and is ~40 lines. Revisit if a large PDF's first paint exceeds the §15.3 budget.
- **D45 — One container per compile, `docker run`, no warm pool.** The example document compiles in well under 3 s cold (Task 2 records the split). A warm pool is only added if Task 16's gate fails twice with the cold path.
- **D46 — Redis pub/sub behind SSE, not DB polling.** The worker and web processes do not share memory; the channel is per project and the SSE route also sends the latest row on connect, so a reconnect is lossless.
- **D47 — The worker is a separate app (`apps/worker`), not a route handler.** Spec §3.1/§11.2; it keeps `pdfjs`/texlive out of the Next runtime and lets the container run with a different resource profile.
- **D48 — Info panel: all four tabs in Phase 3.** Project Info and Versions need the compile pass, Comments is the empty state, Share is the disabled dialog; deferring them would leave Phase 4/5 without a home (user ruling, 2026-11-13).
- **D49 — `texcount` + a small figure/math scanner.** §9.1 says "TeXcount-equivalent, not a client tokenizer"; texcount covers words/headers, the scanner covers figures/math, both run in the worker and are stored on `pdf_renders.stats`.
- **D50 — Coalescing by "newest wins", not by killing the running container.** The per-project lock serialises jobs; a job whose revision is no longer `compile:current:<projectId>` returns `superseded` at the start and its result is discarded at the end. The container is capped at 30 s, so waiting out the old compile is cheaper and safer than racing `docker kill` against the upload; the observable behaviour the spec wants (never show a stale PDF as current) is preserved.
- **D51 — The worker shells out to the Docker CLI.** Dev uses the host daemon (`/var/run/docker.sock`) and `docker run`; Phase 5 replaces this with the Engine API or a socket mount when the worker is containerised.
- **D52 — Visual baselines use a pre-rendered fixture PDF.** The visual harness seeds an `ok` render and uploads the Task 2 artefact to MinIO; it does not run a compile, so the diff measures the viewer, not the container.
- **D53 — The compile API amends §19.3 (spec §19.6).** §19.3's `{ revisionHash }` body contradicts §11.0 ("the client never computes it"); the plan's `{ mainFile }` + `render/*` routes are the contract, and the spec section is edited in the same commit.
- **D54 — The revision hash covers blob documents.** §19.2 hashes `content`, which is `null` for images; the hash now uses `content ?? blobKey`, and `blobKey` is content-addressed. Without this, replacing `diagram.jpg` would not invalidate the render cache.
- **D55 — The §10.6 sandbox wins over the bind mount.** `--read-only` + tmpfs `/work` cannot host a bind mount, so the worker uses `docker create` → `docker cp` in → `docker start -a` → `docker cp` out → `docker rm -f`, with `openin_any=p`, `shell_escape=f`, `-no-shell-escape` and the 20 MB cap.
- **D56 — Visual baselines mask the PDF sheet.** Our render can never match Prism's PDF pixels; the sheet is masked, the chrome is gated (see Task 17).
- **D57 — `pdf_renders.main_file`** — §4's SQL block had no column for it; the pill popover needs the compiled file, not the current main document (spec §19.6 amendment in Task 1).
- **D58 — texcount runs in the same container**, writing `/work/texcount.txt` (`;` after latexmk, so a broken document still produces stats); `texlive-extra-utils` is added to the image.
- **D59 — The Info panel replaces the PDF pane** (Tools menu, 677 px), per §6.3; the earlier 360 px overlay was wrong.
- **D60 — Versions snapshots only text documents**; blob rows have `content: null` and `snapshots.content` is `NOT NULL`, so images are skipped and restore never blanks a document.
- **D61 — Visual references are the full captures, masked at diff time**; `actual.png` is masked and cannot be a reference.
- **D62 — The compile e2e is its own Playwright project** with a global worker setup; the default `e2e` job stays green.
- **D63 — `texmf.cnf` lives in `/etc/texmf`**, where Debian's kpathsea reads it, with a build-time `kpsewhich` assertion.

## Appendix F — Round-3 review resolutions

| Finding | Resolution |
|---|---|
| B1 `main_file` column | Added to Task 1 Step 4; §4 amended |
| B2 `./paths` export | Added to Task 1 Step 5 |
| B3 texcount never runs / not installed | `texlive-extra-utils`; the container writes `texcount.txt`; Task 8 parses it |
| B4 root scripts + wiped seed | The seed lives in `apps/web/src/cli/visual-seed.ts` and runs per test; e2e seeds via an `apps/web` script, not a root import |
| B5 `revision.test.ts` | Moved to `packages/shared/src/`, literals get `blobKey: null`, tsconfig includes tests |
| B6 `texmf.cnf` path | `/etc/texmf` + `TEXMFCNF` + a `kpsewhich` build assertion |
| M1 two supersede mechanisms | `compile:current:<projectId>` is the only one; lock waits 30 s then BullMQ retries |
| M2 conflict has no publisher | The PATCH route publishes it on 409; the e2e wording is corrected |
| M3 spec amendment incomplete | §19.3, §11.4, §4, §11.2 all amended; §18 gets D44–D56 |
| M4 self-referential baselines | References are the full captures; `actual.png` never becomes one |
| M5 visual CI | MinIO + build added to the `visual` job; still non-blocking, stated as such |
| M6 panel trigger/geometry | Tools menu, exclusive, 677 px, §6.3 |
| M7 blob snapshots | Text documents only; blob rows skipped |
| M8 compile e2e cannot run | Separate Playwright project, global worker setup, blob + second-user seeding, longer timeout |
| M9 no `pnpm install` | Every dependency step runs it and commits the lockfile |
| M10 `parseLog` throws on paths | Non-throwing `sanitizeDiagnosticPath` |
| M11 `parseSyncTex` signature | Takes the page boxes explicitly |
| M12 fixed container name | Unique per job |
| Minors | All folded into the owning tasks (see the steps); none deferred except the pre-existing CI `docker exec` helper (recorded as a follow-up) |

Verified sound in round 3 and left unchanged: `getObjectRange` + `Content-Range`, the blob hash (`content ?? blobKey`), the job-basename outputs, the SSE design (Node default, `duplicate()`, resync on connect), the ownership/UUID/revision validation, and the `pdf_renders` unique index.

## Appendix G — Round-4 review resolutions

All six blockers and all 26 majors are fixed inline; the minors are folded into the owning steps. The changes that matter most:

| Finding | Resolution |
|---|---|
| B1 `{skipped:"locked"}` resolves | Throw `Error("locked")`; `attempts: 5`, 1 s backoff |
| B2 no web enqueue path | `apps/web/src/lib/compile-queue.ts` + `bullmq` in `apps/web` |
| B3 failure publishes no event | `status: {state:"error"}` on the failure path |
| B4 config-level globalSetup | Separate `playwright.compile.config.ts` |
| B5 worker records a stale revision | Recompute the hash after materialising; missing key = proceed |
| B6 visual seed | `pdf` dataset, committed PDF, `S3_*` in the test process and CI |
| M1/M2/M26 spec drift | §19.3, §11.4, §4, §11.0, §19.2, §11.2, §9.2, §10.5, §15.1, §16, §18 D44–D63 |
| M3/M4/M5/M6 | `sanitizeDiagnosticPath`, `texcount.txt` copy-out, `latexmk.exit`, `apps/web/scripts` |
| M7/M8/M9/M10 | props moved to Task 10, conflict `documentId`, bucket argument, blank-template clean case |
| M11/M12/M14/M15/M22 | `login(page, {email,password})`, `e2e-seed.ts`, S3 env, `pdf` dataset, `spektrum_test` + S3 in CI |
| M13/M16/M24/M25 | page-indicator mask, deterministic snapshot order, Tools at the tab-row edge + 360–900 resize, seven e2e cases |
| M17/M18/M19/M20/M21/M23 | 72.27 conversion + top origin, worker `pdfjs-dist`, `Input:` normalisation, keystroke metric, installs in Tasks 3/6/11, typed diagnostics |
| Minors | All folded in: math from texcount, `path.basename` case, header assertion, explicit copy chain, `Export` disabled, snapshot grouping + `restoreSnapshots`, DOM-observed conflict, README labels, `deleteObject` rationale |

No round-4 finding is deferred.

