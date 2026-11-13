# Compile, PDF and Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A keystroke becomes a compiled PDF in the right pane in under 3 s, and every compile error lands in the Logs panel at the right line.

**Architecture:** The web app validates the request, computes the project revision and enqueues a compile job on Redis (BullMQ). A separate worker materialises the project into a one-shot, network-less texlive container, runs `latexmk`, parses the `.log` and `.synctex.gz` in Node, uploads the PDF and the SyncTeX map to S3, writes the `pdf_renders` row, and publishes progress on a Redis channel. The browser subscribes over SSE, renders the PDF with `pdfjs-dist`, and drives the Info panel (Project Info, Versions, Comments, Logs) from the render row.

**Tech Stack:** Node 26.13.0, TypeScript 6.0.3, Next 16.4.5 (App Router, route handlers, SSE), React 19.3.1, BullMQ + ioredis, `@aws-sdk/client-s3`, `pdfjs-dist`, Drizzle ORM + Postgres 16, MinIO (dev), Vitest 5.1.0, Playwright 1.65.0.

**Spec:** `zenno/specs/2026-11-07-spektrum-design.md` (authoritative for *what*; §3.1 architecture, §8 PDF viewer, §9 Info panel, §11 compile, §11.3 log parsing, §11.4 progress stream, §11.5 TeX environment, §11.6 SyncTeX, §15.1–15.3 gates, §16 Phase 3 row). Phase 2 handoffs: `zenno/plans/2026-11-07-02-editor.md` (lines 60, 77, 886, 1561, 1787).

## Global Constraints

- **Pinned toolchain** (spec §3.2): Node **26.13.0**, pnpm **12.18.0**, TypeScript **6.0.3**, Next **16.4.5**, React **19.3.1**, Tailwind **4.3.5**, Drizzle **0.45.4**, zod **4.6.7**, Vitest **5.1.0**, Playwright **1.65.0**. Do not upgrade any of them in this phase.
- **Nothing compiles in the browser** (spec §3.1). The client sends `{ projectId, mainFile }` and receives a PDF URL + diagnostics.
- **The database is the source of truth** (spec §11.0). Compile requests carry no content; the worker reads the persisted revision and records its own `revision_hash`.
- **Ownership on every route**: every project/document/render/snapshot handler resolves `requireUser()` and inner-joins `projects` on `id AND ownerId AND deletedAt IS NULL`. Unknown or malformed ids → 404, never 500 (Phase 2 precedent, commit `1f2d8e5`).
- **Mutating routes** call `assertSameOrigin(req, loadWebEnv().authUrl)`; read-only routes do not.
- **API shapes** (spec §19.2 style, extended here): compile `202 { revision }`; SSE events `status` / `log` / `result` / `conflict`; render `200 application/pdf` or `404 { error: "not_found" }`; synctex `200 application/json`; snapshots `200 { snapshots }`, restore `200 { document }`; latest render `200 { render }`.
- **Icons**: every `<svg>` has `viewBox="0 0 16 16"` and uses `currentColor` only; no emoji and no Unicode glyph used as an icon (spec §5.8/§15.2). Reuse `packages/ui/src/icons`; add only `IconFitZoom` (alias of the existing `IconFit`) and `IconLink` if missing.
- **Copy is verbatim** from the captures/spec (§8.1, §9, Appendix C). No new user-facing wording beyond Appendix C.
- **Visual budget**: `pnpm test:visual` stays `continue-on-error: true` in CI and records the ratio; it is a measurement, not a gate (spec §15.1). The **hard release gate** is keystroke → PDF < 3 s for the example document (spec §15.3).
- **e2e runs serially** (`workers: 1`, every spec drives the one owner/DB), and each test gets a fresh `x-forwarded-for` through `login(page)` (`e2e/helpers.ts`). Sign-in rate limit is 5 / 15 min / IP.
- **No `dangerouslySetInnerHTML`** outside the sanitised PDF text layer (spec §15.2). The Phase 2 theme pre-paint script in `apps/web/src/app/layout.tsx` is the only existing exception.

## Review Focus

The spec implies these failure modes but no task's happy path exercises them. Each line names the test that pins it, in the task that owns the code.

1. **A newer revision arrives while a compile is running.** The old compile must not overwrite the new one or leave the status pill claiming `Compiled`. → e2e "a newer edit supersedes the running compile" (Task 8) and the worker's supersede unit test (Task 7).
2. **A compile fails when a previous PDF exists.** The viewer keeps the old PDF and the pill reads `Failed`; it never goes blank (spec §11.2 partial renders). → e2e "a failing compile keeps the last good PDF" (Task 16).
3. **Diagnostic line numbers are off by one.** TeX's `l.<n>` is 1-based, our model is 0-based, and the UI is 1-based; `-file-line-error` prefixes the file. Clicking an error must land on the exact line. → parser unit tests over the captured fixtures (Task 3) and the click-to-line e2e (Task 14).
4. **SyncTeX coordinates land on the wrong page or the wrong line.** `sp` → PDF points → page-relative fractions must be zoom-independent, and reverse lookup must pick the nearest anchor, not the first. → `packages/latex/synctex.test.ts` with a captured map (Task 5) and the viewer's hit-test test (Task 13).
5. **A signed or streamed render leaks across owners.** A second user who guesses `projectId/revision` must get 404, and the S3 object must never be public. → route test "another owner's render is 404" (Task 9).
6. **The worker dies mid-compile.** A `running` row must not wedge the project forever. → worker boot recovery test (Task 7).

---

## What Phase 3 ships (and what it deliberately does not)

Ships: the compile pipeline (worker, texlive image, latexmk, queue, coalescing), the PDF viewer (chrome, zoom, page input, search overlay, dark mode, download, fullscreen), SyncTeX both directions, the Logs panel, the Info panel with **Project Info** (texcount), **Versions** (snapshots + restore), **Comments** (empty state) and **Share** (dialog, Invite disabled), the SSE status stream, and the visual baselines for captures 18, 29–32, 40, 41.

Does not ship: AI (`Fix with AI`, `Fix all with AI` render disabled — Phase 4), comment creation, real sharing/collab, import/export (Phase 5), the `projectPageSections` other than the editor, and a production TeX image registry (Phase 5; CI builds and caches the image).

## File Structure

```
apps/worker/                          new app (compile worker)
  package.json                        @spektrum/worker: bullmq, ioredis, @spektrum/{db,latex,shared}
  src/index.ts                        process entry: BullMQ Worker, boot recovery, graceful stop
  src/compile.ts                      one compile: materialise → container → parse → upload → row → publish
  src/container.ts                    docker run wrapper (caps, no network, timeout, kill)
  src/materialise.ts                  write the project's documents into a temp /work dir
  src/publish.ts                      Redis pub/sub publisher for render events
  src/recover.ts                      mark stale `running` rows as error on boot
  src/queue.ts                        shared Redis/BullMQ connection + queue name

packages/latex/                       new package (pure TS, no runtime deps)
  src/index.ts                        re-exports
  src/parse-log.ts                    main.log → Diagnostic[] (spec §11.3)
  src/stats.ts                        texcount output + figure/math counts → ProjectStats
  src/synctex.ts                      .synctex.gz → SyncTexMap (spec §11.6)
  fixtures/*.log                      12 captured logs (Appendix B)
  fixtures/synctex/*.synctex.gz       one captured map
  fixtures/texcount/*.txt             captured texcount output

packages/shared/src/compile.ts        zod contracts: CompileJob, Diagnostic, SyncTexMap, ProjectStats, RenderEvent

packages/storage/                     new package (server-only S3)
  src/index.ts                        putObject, getObject, getObjectRange, deleteObject

apps/web/src/app/api/projects/[projectId]/
  compile/route.ts                    POST: validate + dedupe + enqueue (202 { revision })
  render/stream/route.ts              GET: SSE over Redis pub/sub
  render/latest/route.ts              GET: latest render row for the Info panel
  render/[revision]/pdf/route.ts      GET: auth-checked PDF stream (Range passthrough)
  render/[revision]/synctex/route.ts  GET: auth-checked SyncTeX JSON
  snapshots/route.ts                  GET: list versions
  snapshots/[snapshotId]/restore/route.ts  POST: restore a snapshot

apps/web/src/lib/
  render-store.ts                     server: S3-backed render reads (presign-free)
  snapshots.ts                        snapshot create/prune/restore (ownership-scoped)
  compile-client.ts                   browser: POST compile, EventSource wrapper
  render-client.ts                    browser: RenderEvent parsing

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
scripts/build-texlive.sh              one-shot image build (CI and local)
scripts/gen-latex-fixtures.ts         compile broken docs → capture logs into packages/latex/fixtures

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
- Modify: `packages/shared/src/index.ts` (re-export)
- Modify: `packages/db/src/schema.ts` (render status enum + `stats`)
- Create: `packages/db/drizzle/<generated>.sql` via `pnpm db:generate`
- Test: `packages/shared/src/compile.test.ts`

**Interfaces:**
- Produces: `CompileJob`, `Diagnostic`, `SyncTexMap`, `ProjectStats`, `RenderEvent`, `renderStatus` (enum with `queued | running | ok | error`).

- [ ] **Step 1: Write the failing test** — `compile.test.ts` parses a sample job, a sample event and a sample stats object; asserts `RenderEvent` rejects an unknown `event` value and that `Diagnostic.line` is a non-negative integer.

```ts
import { describe, expect, it } from "vitest";
import { compileJobSchema, diagnosticSchema, renderEventSchema, projectStatsSchema } from "./compile";

describe("compile contracts", () => {
  it("accepts a compile job", () => {
    expect(compileJobSchema.parse({ projectId: crypto.randomUUID(), revisionHash: "abc", mainFile: "main.tex" }).mainFile).toBe("main.tex");
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
- [ ] **Step 4: Extend the DB schema** — `renderStatusEnum` gains `"running"` and `"superseded"`; `pdfRenders` gains `stats: jsonb("stats")` (nullable). Run `pnpm db:generate && pnpm db:migrate`, then `pnpm --filter @spektrum/db test`.
- [ ] **Step 5: Register the new Vitest projects** — `vitest.config.ts` enumerates projects explicitly (`shared`, `ui`, `web`, `db`), so a test in a new package silently never runs. Add `latex` (`packages/latex/**/*.test.ts`), `storage` (`packages/storage/**/*.test.ts`) and `worker` (`apps/worker/**/*.test.ts`) with the same env as `web` (`DATABASE_URL`, `REDIS_URL`, auth secrets); `apps/worker` also needs the `@` alias only if a test imports it. Verify with `pnpm exec vitest run --project latex` → "no test files found" before the package exists, then the new tests after Task 3.
- [ ] **Step 6: Run the tests and typecheck** — `pnpm exec vitest run packages/shared packages/db && pnpm typecheck` → PASS.
- [ ] **Step 7: Commit** — `feat(compile): add shared render contracts and the running status`.

### Task 2: The texlive image and a real compile smoke test

**Files:**
- Create: `docker/texlive/Dockerfile`, `scripts/build-texlive.sh`, `scripts/compile-smoke.ts`
- Test: the smoke script itself (run once, output committed to the ledger)

**Interfaces:**
- Produces: the image `spektrum-texlive:dev` and the exact `latexmk` invocation later tasks reuse.

- [ ] **Step 1: Write the Dockerfile** from spec §11.5: `debian:bookworm-slim`, `texlive-latex-base`, `texlive-latex-extra`, `texlive-fonts-recommended`, `texlive-science`, `texlive-pictures`, `texlive-xetex`, `texlive-luatex`, `texlive-bibtex-extra`, `texlive-lang-english`, `texlive-lang-french`, `latexmk`; create a non-root user; `ENV DEBIAN_FRONTEND=noninteractive`. Keep the package list in one block with a comment citing §11.5.
- [ ] **Step 2: Build and record the digest** — `scripts/build-texlive.sh` runs `docker build -t spektrum-texlive:dev docker/texlive` and prints `spektrum-texlive:dev sha256:…`. Expected: build succeeds (20–60 min, one time) and `docker run --rm spektrum-texlive:dev latexmk --version` prints a version.
- [ ] **Step 3: Write the smoke script** — materialise `zenno/recon/extracted/example-main.tex` **plus its `diagram.jpg`** into a temp dir and run the exact command the worker will use. The capture's example document has `\includegraphics[width=\linewidth]{diagram.jpg}` (line 59) and `diagram.jpg` is not in the repo: add a small generated JPEG at `packages/latex/fixtures/src/diagram.jpg` and copy it next to `main.tex` (without it, latexmk errors on a missing file and the smoke test is meaningless).

```bash
docker run --rm --network none --memory 2g --cpus 2 --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  -v "$WORK:/work" -w /work spektrum-texlive:dev \
  latexmk -interaction=nonstopmode -halt-on-error -file-line-error -synctex=1 \
          -pdf -outdir=/work/out main.tex
```

- [ ] **Step 4: Run the smoke script and record the result** — `pnpm exec tsx scripts/compile-smoke.ts`; expected: `out/main.pdf` and `out/main.synctex.gz` exist and the wall time is printed. Record the timing in the ledger (`< 3 s` target; if the cold run exceeds it, proceed — Task 8 measures the full path and Task 2's Appendix A records the split).
- [ ] **Step 5: Commit** — `feat(texlive): add the compile image and a smoke compile`.

### Task 3: The log parser with captured fixtures

**Files:**
- Create: `packages/latex/{package.json,src/index.ts,src/parse-log.ts,fixtures/*.log}`
- Create: `scripts/gen-latex-fixtures.ts`
- Test: `packages/latex/src/parse-log.test.ts`

**Interfaces:**
- Consumes: `Diagnostic` from `@spektrum/shared`.
- Produces: `parseLog(raw: string): Diagnostic[]`.

- [ ] **Step 1: Generate the 12 fixtures** — add the 12 broken sources under `packages/latex/fixtures/src/<name>.tex` (Appendix B), then extend `scripts/gen-latex-fixtures.ts` to compile each inside `spektrum-texlive:dev`, copy `out/main.log` to `packages/latex/fixtures/<name>.log`, and print the list. Expected: 12 non-empty logs. `timeout` and `partial-render` cannot come from a normal compile: synthesise them by truncating a real log at a `! LaTeX Error` block (`timeout` has no `l.<n>` line; `partial-render` stops after the first page's warnings).
- [ ] **Step 2: Write the failing tests** — one `it` per rule in spec §11.3, using the fixtures: `! LaTeX Error`, `! Emergency stop.`, `! Undefined control sequence.`, `file.tex:12:` prefix, `Overfull \hbox … at lines A--B` → warning at `A` with message `Overfull \hbox (Xpt too wide) detected at line A`, `Underfull \hbox`/`\vbox`, `LaTeX Warning:`, `Package xyz Warning:`, `Missing character:` → info, 79-column unwrapping, duplicate suppression by `(severity, message, file, line)`, and `raw` carrying the original block.
- [ ] **Step 3: Run the tests and watch them fail** — `pnpm exec vitest run packages/latex` → FAIL.
- [ ] **Step 4: Implement `parseLog`** — unwrap at 79 columns first; match the rules in order; `file:line:` prefix wins over `l.<n>`; convert TeX's 1-based line to the model's 0-based (`line = n - 1`); suppress duplicates; keep the multi-line block as `raw`.
- [ ] **Step 5: Run the tests and typecheck** — `pnpm exec vitest run packages/latex && pnpm typecheck` → PASS.
- [ ] **Step 6: Commit** — `feat(latex): parse TeX logs into diagnostics`.

### Task 4: Project stats (texcount-equivalent)

**Files:**
- Create: `packages/latex/src/stats.ts`, `packages/latex/fixtures/texcount/*.txt`
- Test: `packages/latex/src/stats.test.ts`

**Interfaces:**
- Consumes: `ProjectStats`; texcount output captured in the fixtures.
- Produces: `parseTexcount(output: string, source: string): ProjectStats`.

- [ ] **Step 1: Capture the fixtures** — run `texcount -total -merge -q main.tex` and `texcount -char -merge main.tex` in the container for the example document and one multi-file document; save the outputs under `packages/latex/fixtures/texcount/`.
- [ ] **Step 2: Write the failing test** — parse the captured output and assert the exact card values for the example document (words, words in text, words in headers, words outside text, headers), plus figures and math counts computed from the source (`figure`/`table` environments, `$…$`, `$$…$$`, `\(…\)`, `\[…\]`).
- [ ] **Step 3: Run and watch it fail** — `pnpm exec vitest run packages/latex/src/stats.test.ts`.
- [ ] **Step 4: Implement `parseTexcount`** — regex the texcount summary; count figures/math with a small scanner; return `ProjectStats` (0 when a field is absent).
- [ ] **Step 5: Run and commit** — tests PASS; `feat(latex): add compile-time project statistics`.

### Task 5: The SyncTeX parser

**Files:**
- Create: `packages/latex/src/synctex.ts`, `packages/latex/fixtures/synctex/example.synctex.gz`
- Test: `packages/latex/src/synctex.test.ts`

**Interfaces:**
- Consumes: `SyncTexMap`; the captured `.synctex.gz` from Task 2.
- Produces: `parseSyncTex(gz: Buffer): SyncTexMap`.

- [ ] **Step 1: Copy the captured map** — copy `out/main.synctex.gz` from Task 2's smoke run to the fixture path.
- [ ] **Step 2: Write the failing tests** — assert the forward map has an entry for `main.tex`, that a known editor line maps to a page and 0–1 fractions, that `backward` anchors are ordered by `y`, that coordinates are zoom-independent (the fractions do not depend on any page size), and that a file with no SyncTeX records degrades to an empty map rather than throwing.
- [ ] **Step 3: Run and watch it fail** — `pnpm exec vitest run packages/latex/src/synctex.test.ts`.
- [ ] **Step 4: Implement `parseSyncTex`** — gunzip (`node:zlib`), parse the `Input:`/`Output:`/`{`/`}` records, convert `sp` (65536/inch) → PDF points (72/inch) → page-relative fractions using the page's `Content:` box size from the file's `PAGE`/`Content` records; produce the exact `SyncTexMap` shape from spec §11.6.
- [ ] **Step 5: Run, typecheck, commit** — `feat(latex): parse SyncTeX maps for two-way sync`.

### Task 6: Storage package

**Files:**
- Create: `packages/storage/{package.json,src/index.ts}` (package name `@spektrum/storage`)
- Test: `packages/storage/src/index.test.ts` (against MinIO; skipped when `S3_ENDPOINT` is unset)

**Interfaces:**
- Produces: `putObject(key, body, contentType)`, `getObject(key)`, `getObjectRange(key, start, end)`, `deleteObject(key)`, `bucket()`.

- [ ] **Step 1: Write the failing test** — gate the suite on `process.env.STORAGE_IT === "1"` (a developer/CI run without MinIO must not fail `pnpm test`). With `docker compose -f docker/compose.dev.yml up -d minio createbuckets` running, `STORAGE_IT=1 pnpm exec vitest run --project storage` puts a small object, reads it back, reads a byte range and deletes it → FAIL.
- [ ] **Step 2: Implement the client** — `@aws-sdk/client-s3` with `forcePathStyle: true` and the `S3_*` env vars; throw a typed `StorageError` on a missing object so callers can map it to 404.
- [ ] **Step 3: Run the test and commit** — `feat(storage): add the S3-backed render store`.

### Task 7: The worker: queue, recovery and coalescing

**Files:**
- Create: `apps/worker/{package.json,src/index.ts,src/queue.ts,src/recover.ts}`
- Modify: `docker/compose.dev.yml` (no new service in dev; the worker runs with `pnpm --filter @spektrum/worker dev`)
- Test: `apps/worker/src/recover.test.ts`, `apps/worker/src/queue.test.ts`

**Interfaces:**
- Consumes: `CompileJob`, the `compile` queue, `pdfRenders`.
- Produces: `QUEUE_NAME = "compile"`, `connectRedis(): Redis`, `claimNext()` (for tests), `recoverStaleRuns(db): Promise<number>`.

- [ ] **Step 1: Write the failing recovery test** — insert a `running` row older than 2 minutes, run `recoverStaleRuns`, assert it becomes `error` with `log = "worker restarted"`; a fresh `running` row is untouched. `pnpm exec vitest run apps/worker/src/recover.test.ts` → FAIL.
- [ ] **Step 2: Implement recovery + the worker entry** — BullMQ `Worker(QUEUE_NAME, handler, { connection, concurrency: 2 })`; on boot call `recoverStaleRuns`; on SIGTERM close the queue and exit 0. Per-project serialization with a Redis lock `compile-lock:<projectId>` (TTL 5 min, released in `finally`).
- [ ] **Step 3: Write the supersede test** — a job whose `revisionHash` is not the newest queued revision for its project returns `{ skipped: "superseded" }` without touching the DB. `pnpm exec vitest run apps/worker/src/queue.test.ts` → PASS.
- [ ] **Step 4: Run and commit** — `feat(worker): add the compile queue, boot recovery and supersede check`.

### Task 8: The compile job

**Files:**
- Create: `apps/worker/src/{compile.ts,container.ts,materialise.ts,publish.ts}`
- Test: `apps/worker/src/compile.test.ts` (integration, requires the texlive image and MinIO)

**Interfaces:**
- Consumes: `CompileJob`, `listRevisionDocuments`, `parseLog`, `parseSyncTex`, `parseTexcount`, `putObject`.
- Produces: `runCompile(job: CompileJob): Promise<{ status: "ok" | "error"; durationMs: number }>`.

- [ ] **Step 1: Write the failing integration test** — gate it on `RUN_COMPILE_IT=1` (the texlive image, MinIO and Redis are not present in the default CI test job; a gated suite keeps `pnpm test` green everywhere). It enqueues the example project's revision, runs `runCompile`, and asserts the `pdf_renders` row is `ok`, the PDF object exists in MinIO, `diagnostics` is `[]` for the clean document, `durationMs` is a number, and a Redis `result` event was published.
- [ ] **Step 2: Implement materialise + container** — write every document row to a temp dir (`fs.mkdtemp`), resolving each path with `normalizeDocumentPath` and asserting the result stays inside the temp dir (a crafted `path` must not escape). A row with `content === null` is an S3 blob (images, large files): fetch it with the `blobKey`; only `content` rows are written directly. Copy `diagram.jpg` from `packages/latex/fixtures/src` when the main file references it and no document row provides it. Then the exact `docker run` from Task 2 with a 30 s timeout, `--network none`, caps, non-root; on timeout `docker kill` and return `error` with `Compilation timed out after 30s`.
- [ ] **Step 3: Implement `runCompile`** — choose the program before the run: `% !TEX program = xelatex|lualatex|pdflatex` in the main file wins, else `pdflatex` (spec §11.2 step 4), and pass `-xelatex`/`-lualatex`/`-pdf` accordingly. Insert/update the `pdf_renders` row (`running`, `mainFile`), publish `status: running`, stream stdout lines as `log` events (cap 200), then parse `out/main.log` → diagnostics, `out/main.synctex.gz` → map, texcount → stats; store the last 2 000 lines of `main.log` in `pdf_renders.log` (the Raw logs view); upload `pdf/<projectId>/<revision>.pdf` and `synctex/<projectId>/<revision>.json`; update the row to `ok` (or `error` with the tail of stderr); publish `result` (with the route-relative `pdfUrl`, diagnostics, stats, durationMs). If the revision already has an `ok` row, return it without a container (spec §11.2 step 2). Before writing the row, re-check `compile:current:<projectId>`; if it no longer equals `job.revisionHash`, mark the row `superseded` and write nothing (a newer revision won).
- [ ] **Step 4: Test the failure path** — compile a document with a deliberate error; assert the row is `error`, `diagnostics` contains the error at the right line, and no PDF object is written. Add the test to `compile.test.ts`.
- [ ] **Step 5: Run the integration test and commit** — `pnpm exec vitest run apps/worker` → PASS; `feat(worker): run latexmk in the texlive container and record the render`.

### Task 9: Render reads: PDF stream, SyncTeX, latest

**Files:**
- Create: `apps/web/src/lib/render-store.ts`, the four route files listed in the File Structure
- Test: `apps/web/src/lib/render-store.test.ts` (route-level, ownership + Range)

**Interfaces:**
- Consumes: `getObject`, `getObjectRange`, `requireUser`, `getProject`.
- Produces: `GET /api/projects/:id/render/:revision/pdf` (206 for `Range`, `Content-Type: application/pdf`, `Accept-Ranges: bytes`), `GET .../synctex`, `GET .../render/latest` → `{ render }` where render is `{ revision, status, mainFile, stats, diagnostics, durationMs, createdAt }` (latest row by `createdAt`, any status; no bytes), `GET .../render/:revision/pdf` 404 for another owner.

- [ ] **Step 1: Write the failing tests** — (a) the owner gets 200 and the PDF bytes; (b) a `Range: bytes=0-99` request gets 206 with 100 bytes and `Content-Range`; (c) a second user gets 404; (d) an unknown revision gets 404; (e) the latest route returns the newest row.
- [ ] **Step 2: Run and watch them fail** — `pnpm exec vitest run apps/web/src/lib/render-store.test.ts`.
- [ ] **Step 3: Implement the routes** — resolve `projectId`/`revision` as UUIDs where applicable (404 on malformed), verify ownership, then stream from S3; do not redirect to S3 (the bytes stay auth-checked).
- [ ] **Step 4: Run, typecheck, commit** — `feat(render): serve the PDF, SyncTeX map and latest render behind ownership checks`.

### Task 10: The SSE stream and the compile trigger

**Files:**
- Create: `apps/web/src/app/api/projects/[projectId]/compile/route.ts`, `.../render/stream/route.ts`, `apps/web/src/lib/compile-client.ts`
- Modify: `apps/web/src/app/(app)/u/[projectId]/use-autosave.ts` (no change to the save logic; expose an `onSaved` callback), `editor-client.tsx` (wire the triggers)
- Test: `apps/web/src/lib/compile-client.test.ts` (SSE parser, `EventSource` fake)

**Interfaces:**
- Consumes: `CompileJob`, `RenderEvent`, `revisionHash`, `listRevisionDocuments`, `pdfRenders`.
- Produces: `POST /api/projects/:id/compile` body `{ mainFile }` → `202 { revision }` (or `200 { revision, cached: true }` when the revision already has an `ok` row); `GET .../render/stream` emits `event: status|log|result|conflict`; `useRenderStream(projectId)` returns the latest `RenderEvent` state.

- [ ] **Step 1: Write the failing SSE test** — a fake Redis publisher emits `status`, `log`, `result`, `conflict`; the parser yields the events in order; a malformed `data:` line is ignored, not thrown. `pnpm exec vitest run apps/web/src/lib/compile-client.test.ts` → FAIL.
- [ ] **Step 2: Implement the route + hook** — `ReadableStream` with `export const runtime = "nodejs"`; send an initial `status` from the latest row; subscribe to `render:<projectId>`; heartbeat `: ping\n\n` every 15 s; abort on `req.signal`. The hook uses `EventSource` and falls back to the latest-render route on error.
- [ ] **Step 3: Wire the triggers** — compile when: an autosave completes and `realtimeCompilation` is on and the buffer is clean; `Cmd/Ctrl+S`; the PDF refresh button; project open (mount, when no render matches the revision); toggling realtime compilation on. The body is `{ mainFile }`, resolved from the project's `mainDocumentId` path (the route 404s if the path is not a document of the project). Suppress while the buffer is dirty and show `Unsaved changes` instead. Before enqueueing, set the Redis key `compile:current:<projectId>` to the revision; the worker discards a finished compile whose revision is no longer current (Appendix E, D50). On an autosave conflict (409) publish `conflict { revision }` on the project channel; the losing tab reloads that document and restores the cursor (spec §11.0) — e2e: two tabs, edit in one, assert the other reloads at the same line.
- [ ] **Step 4: Run and commit** — `feat(compile): enqueue compiles, stream progress and signal conflicts`.

### Task 11: PDF viewer core

**Files:**
- Create: `apps/web/src/components/pdf/{pdf-viewer.tsx,use-pdf-document.ts}`, `public/pdf.worker.min.mjs` (copied), `scripts/copy-pdf-worker.mjs`
- Modify: `apps/web/package.json` (`pdfjs-dist`, `predev`/`prebuild` copy), `.gitignore` (the copied worker), `editor-client.tsx` (replace `PdfPane` with the viewer)
- Test: `apps/web/src/components/pdf/use-pdf-document.test.ts` (document loading, page count, failure → null)

**Interfaces:**
- Consumes: the render stream's `pdfUrl` and `revision`; `pdfjs-dist`.
- Produces: `<PdfViewer pdfUrl revision zoom pageCount onPageChange />` rendering one canvas per visible page, re-rendering on zoom/DPR change, and exposing the page count upward.

- [ ] **Step 1: Pin `pdfjs-dist`** — install the current release, record the exact version in Appendix E (like `monaco-editor 0.57.0`), and do not use a range. Then decide the worker loading path — a throwaway check that `GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"` works with Next 16 + Turbopack; if the bundler path fails, use `new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" })`. Record the chosen path in Appendix E. Add `scripts/copy-pdf-worker.mjs` to `predev`/`prebuild`.
- [ ] **Step 2: Write the failing test** — load the example PDF from the fixture store (or the render route in a node test), assert `numPages` and that a page renders to a canvas with non-zero size; a 404 URL resolves to `null`, not a throw.
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

- [ ] **Step 1: Write the failing component tests** — the pill shows each state; the page input clamps to `1..numPages`; the zoom menu lists the exact values from §8.1; the search pill opens on `Cmd/Ctrl+F` and closes on `Esc`; typing in the pill does not reach the editor.
- [ ] **Step 2: Run and watch them fail** — `pnpm exec vitest run apps/web/src/components/pdf`.
- [ ] **Step 3: Implement the chrome** — exact copy from Appendix C; icons from `@spektrum/ui/icons`; `aria-label`s; the pill's popover; `fullscreen` via the Fullscreen API; `window.open` for the new window; the screen-reader text layer toggle.
- [ ] **Step 4: Implement the search pill** — `#353535`, `--radius-3xl`, `--shadow-surface`, right-aligned below the chrome; extract page text with `getTextContent()`, find hits, draw `--notification-border-warning` rects; no next/previous buttons, no count inside the pill.
- [ ] **Step 5: Run, typecheck, commit** — `feat(pdf): add the viewer chrome and search overlay`.

### Task 13: SyncTeX two-way sync

**Files:**
- Create: `apps/web/src/components/pdf/{use-sync-scroll.ts,use-sync-jump.ts}`, `apps/web/src/lib/synctex-client.ts`
- Test: `apps/web/src/components/pdf/use-sync-scroll.test.ts` (nearest-anchor hit test)

**Interfaces:**
- Consumes: `SyncTexMap`, the editor's cursor line, `MonacoEditorHandle` (add `revealLine(line: number)`), the PDF page geometry.
- Produces: forward: on cursor move (120 ms debounce) scroll to `{page,x,y}` and flash the line rect (`--bg-preview-hover-inverted`, 900 ms fade); backward: double-click a PDF line → `revealLine` + set position; if the map is missing, both are disabled (no throw).

- [ ] **Step 1: Write the failing hit-test** — anchors at `y = 0.2, 0.5, 0.8` on page 2; a click at `0.55` picks the `0.5` anchor and maps to its `path`/`line`; a click above the first anchor picks the first; an empty map returns `null`.
- [ ] **Step 2: Run and watch it fail** — `pnpm exec vitest run apps/web/src/components/pdf/use-sync-scroll.test.ts`.
- [ ] **Step 3: Implement both hooks** — fetch `…/render/:revision/synctex` once per revision; forward: `forward[activePath]` → the nearest entry by line; backward: nearest anchor by `y` within the page. Guard `path` normalization (the map's paths are project-relative, same as the editor's).
- [ ] **Step 4: Run, typecheck, commit** — `feat(pdf): sync the editor and the PDF both ways`.

### Task 14: Logs panel and the Info panel shell

**Files:**
- Create: `apps/web/src/components/info-panel/{info-panel.tsx,logs.tsx}`
- Modify: `editor-client.tsx` (panel state, trigger), `apps/web/src/app/(app)/u/[projectId]/page.tsx` (pass `initialRender`)
- Test: `apps/web/src/components/info-panel/logs.test.tsx`, `e2e/info-panel.spec.ts`

**Interfaces:**
- Consumes: `Diagnostic[]`, the render state, `revealLine` from Task 13.
- Produces: `<InfoPanel tab onTabChange … />` with the four tabs in capture order (`Project Info`, `Versions`, `Comments`, `Logs`), 44 px tab bar, `--border-brand` underline, close button; the Logs filter menu (`Warnings and Errors`, `Warnings only`, `Errors only`, `Raw logs`); each entry card with severity rule/icon, message, `file:line`, and a disabled `Fix with AI`; clicking the card calls `revealLine(line)`.

- [ ] **Step 1: Measure the panel from the captures** — open `~/Pictures/Screenshots/screenshot-2026-11-05_21-26-13-google-chrome.png` (Project Info) and `…21-26-50…png` (Logs), and record the panel width, tab height, tab labels/order and card padding in Appendix A. The plan assumes 360 px wide and 44 px tabs; if the capture differs, use the capture and note it here before building.
- [ ] **Step 2: Write the failing tests** — the default filter is `Warnings and Errors`; `Errors only` hides warnings; `Raw logs` shows the monospace tail on `--bg-code`; a card click calls `revealLine` with the 1-based line converted back to the editor's line; the empty state renders when there is no render at all (Project Info shows zeroed cards, Logs shows `No errors or warnings`); the header `Fix all with AI` button exists and is disabled.
- [ ] **Step 3: Run and watch them fail** — `pnpm exec vitest run apps/web/src/components/info-panel`.
- [ ] **Step 4: Implement the panel** — the trigger is an `IconInfo` button in the centre column's 16 px icon strip (`aria-label="Project info"`), the panel overlays the right pane at 360 px; `Escape` closes; the panel state survives a tab switch but not a reload.
- [ ] **Step 5: Run, typecheck, commit** — `feat(info-panel): add the panel shell and the Logs tab`.

### Task 15: Project Info, Versions, Comments and Share

**Files:**
- Create: `apps/web/src/components/info-panel/{project-info.tsx,versions.tsx,comments.tsx,share-dialog.tsx}`, `apps/web/src/lib/snapshots.ts`, `apps/web/src/app/api/projects/[projectId]/snapshots/route.ts`, `.../snapshots/[snapshotId]/restore/route.ts`
- Modify: `apps/worker/src/compile.ts` (snapshot after a successful compile), `packages/db/src/schema.ts` (no change; the table exists)
- Test: `apps/web/src/lib/snapshots.test.ts`, `apps/web/src/components/info-panel/versions.test.tsx`

**Interfaces:**
- Consumes: `ProjectStats` (from the `result` event), `snapshots` table, `documents`.
- Produces: `snapshotAfterCompile(projectId, userId, changedPaths)`, `pruneSnapshots(projectId, keep = 50)`, `restoreSnapshot(userId, projectId, snapshotId)`, `GET /snapshots`, `POST /snapshots/:id/restore`. `changedPaths` is computed inside `snapshotAfterCompile`: for each document, compare `sha256(content)` with the newest snapshot's content hash for that document; only differing documents are inserted (spec §9.2 "when content changed").

- [ ] **Step 1: Write the failing snapshot tests** — after a successful compile, one snapshot per changed document; a second compile with no change creates none; the 51st snapshot deletes the oldest; restore writes the snapshot content back and bumps `updatedAt`; another owner's restore is 404.
- [ ] **Step 2: Run and watch them fail** — `pnpm exec vitest run apps/web/src/lib/snapshots.test.ts`.
- [ ] **Step 3: Implement the snapshot logic + routes** — snapshot rows share `createdAt` per compile; the Versions list groups by day and labels each row `Edited workspace` with the relative time; restore returns the updated document.
- [ ] **Step 4: Implement the three tabs + Share** — Project Info cards from `ProjectStats` (11/14 tertiary labels, 20/28 values; zeroed when no render exists); Versions: 28 px thumbnail, title `Edited workspace`, relative time, `⋯` menu with `Restore`, a 28 px author avatar with a red ring, footer `Showing N of M versions`; Comments: filter dropdown + search + `No comments yet`; Share: 480 px dialog, email + disabled `Invite` with helper `Sharing arrives in v2`, `People with access`, `Only invited users` disabled, `Copy link` + `Done`; open it from the project menu (`Open project menu` → `Share`).
- [ ] **Step 5: Run, typecheck, commit** — `feat(info-panel): add project info, versions, comments and share`.

### Task 16: Behavioural e2e and the performance gate

**Files:**
- Create: `e2e/compile.spec.ts`
- Test: the spec itself

**Interfaces:**
- Consumes: the whole pipeline; the example document from `zenno/recon/extracted/example-main.tex`.

- [ ] **Step 1: Write the failing specs** — a global setup starts `pnpm --filter @spektrum/worker dev` (the behavioural `webServer` only starts Next; the worker, Redis, MinIO and the texlive image are prerequisites) and tears it down. (a) open a project → warm the pipeline with one compile, then measure the second: `Date.now()` at the autosave `PATCH` response to the `result` SSE event, assert `< 3000` (the cold first compile includes queue/worker warm-up and is not the gate); (b) a deliberate error puts an error card in Logs and clicking it moves the cursor to the right line; (c) a newer edit supersedes the running compile (the final PDF matches the newest revision); (d) a failing compile keeps the last good PDF and the pill reads `Failed`; (e) another user's render URL is 404.
- [ ] **Step 2: Run and watch them fail** — `pnpm exec playwright test e2e/compile.spec.ts` (serial, `workers: 1`).
- [ ] **Step 3: Implement whatever the tests expose** — no new features; fix the pipeline until all five pass twice in a row (the timing test is the release gate; record both runs in the ledger).
- [ ] **Step 4: Run the full behavioural suite** — `pnpm exec playwright test e2e` → all green.
- [ ] **Step 5: Commit** — `test(compile): pin the <3 s gate, supersede, failure and ownership`.

### Task 17: Visual baselines and CI

**Files:**
- Create: `e2e/visual/pdf.spec.ts`, `e2e/visual/logs.spec.ts`
- Modify: `e2e/visual/fixtures.ts` (a seeded project with the example document + one deliberate error), `e2e/baselines/reference/*` (new baselines; re-shot editor baselines)
- Test: the specs themselves

**Interfaces:**
- Consumes: `compareAgainstReference`, `VISUAL_BUDGET` (0.0015), `seedEditorFixture`.

- [ ] **Step 1: Measure the panel geometry** — open `~/Pictures/Screenshots/screenshot-2026-11-05_21-26-13-google-chrome.png` and `…21-26-50…png`, record the Info panel width, tab height and card metrics in Appendix A; adjust Task 14/15 if they differ.
- [ ] **Step 2: Write the cases** — `pdf--dark--compiled` (capture 18), `logs--dark--default`, `logs--dark--filter-menu` (29–30), `pdf--dark--more-menu`, `pdf--dark--zoom-menu` (31–32), `editor--light--context-menu` (40), `pdf--light--search` (41). Each case seeds a project whose `pdf_renders` row is `ok` and whose PDF is already in MinIO (upload the Task 2 artefact with `@spektrum/storage` from a `scripts/seed-render.ts` run in a global setup; no worker is needed for a visual diff). The visual `webServer` env gains `S3_*` and the compose stack must be up.
- [ ] **Step 3: Run and watch them fail** — `pnpm test:visual` → FAIL (no baselines yet); `compare.ts` writes `actual.png` and `diff.png` under `test-results/`.
- [ ] **Step 4: Generate the baselines** — for each case, crop `actual.png` to the app region (2182×1174) and copy it to `e2e/baselines/reference/<name>.png`, exactly as Phase 1/2 did (there is no update flag); add the mapping row to `e2e/baselines/README.md` with the source capture. Re-run and record the ratios in Appendix A (the budget is a measurement, not a gate).
- [ ] **Step 5: Re-shoot the two Phase 2 editor baselines** — the real viewer replaces the `Initializing...` placeholder, so `editor--dark--blank` and `editor--light--blank` change legitimately; update them in the same commit and note it in the ledger.
- [ ] **Step 6: Verify CI** — `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; the `visual` job stays `continue-on-error: true`; the `compile` e2e job is required.
- [ ] **Step 7: Commit** — `test(visual): add the Phase 3 PDF and Logs baselines`.

---

## Appendix A — Evidence to record

- The texlive image digest and the smoke compile time (Task 2).
- The full compile path timing split: queue wait, container start, latexmk, upload (Task 8/16).
- The Info panel geometry measured from captures 23–30 (Task 17).
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