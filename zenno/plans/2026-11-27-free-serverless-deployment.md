# Free Serverless Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Spektrum deployable on Vercel Hobby with a public `spektrum.*` URL, public signup, BYOK chat, browser-WASM compilation and R2-backed persistence, without changing `main`.

**Architecture:** The Docker worker, TeX Live container and server render SSE are removed on this branch. Compilation runs in a browser Web Worker and commits its result through an ownership-checked API; large files go straight to R2 through short-lived signed URLs so no function sees a body over 4.5 MB. Neon, Upstash and R2 replace the bundled Postgres, Redis and SeaweedFS.

**Tech Stack:** Next.js 16 App Router, Node 26.13.0, pnpm 12.18.0, Zod, Drizzle, ioredis/Upstash, AWS SDK v3 presigner, BusyTeX/SwiftLaTeX WASM, PDF.js, Vitest.

**Spec:** `zenno/specs/2026-11-27-free-serverless-deployment-design.md`

## Global Constraints

- Work only on branch `free-serverless-deploy`; never change the VPS path or shared defaults that `main` depends on.
- Node `26.13.0`, pnpm `12.18.0`, `engine-strict`; Node 26 is GA on Vercel and `engines.node` is honoured.
- Vercel Hobby: **4.5 MB request bodies**, **2 GB fixed memory** (not settable), **300 s max duration** including streams, non-commercial use only.
- No Docker socket, no permanent worker, no local persistent filesystem, no host cron.
- Data services: Neon Postgres (enable `citext`), Upstash Redis, Cloudflare R2 (`spektrum-uploads`, `spektrum-pdf`); all free, no card.
- Every uploaded object key is `u/<userId>/<kind>/<uuid>.<ext>` with `kind ∈ {import, workspace, chat-image, render}`; the server verifies prefix and kind before persisting a key.
- `ALLOW_PUBLIC_SIGNUP` stays `false` in shared code; set `true` only as a Vercel deployment env var after the owner exists.
- Chat: members use BYOK; the server key remains owner-only. Text-only requests keep a plain string body and gateway content byte-for-byte.
- No AGPL WASM code is vendored or modified; load engines from an external CDN with attribution.
- Keep `pnpm test`, `pnpm typecheck`, `pnpm lint` green; commit each task separately; do not push.

## Review Focus

- **Foreign blob keys** (a user submits another user's `blobKey` to import/upload/chat/render commit) must be rejected with 400/404 and must never read or persist the other tenant's object — pinned in Tasks 4, 5 and 7.
- **Text-only chat** must remain a plain string in both the request body and gateway content — pinned in Task 5.
- **Rejected images** must not poison later turns: with key-based images, `omitHistoryImages` still strips *all* history images and retry still reuses the failed row — pinned in Task 5.
- **Compile results** must be owned, unique per `(projectId, revision)` and upsertable; a non-owner commit must not write — pinned in Task 7.
- **Public signup abuse** (anonymous accounts exhausting R2/Redis quotas, or reaching admin routes) must be bounded by quotas and throttles — pinned in Tasks 3 and 9.

## File Structure

```
packages/storage/src/index.ts          presigning, S3_REGION, bucket abstraction
packages/shared/src/env.ts             S3 env values in WebEnv + .env.example test
packages/shared/src/rate-limit.ts      new storage/signup budgets + adapter seam
packages/shared/src/ai/images.ts       chatImageRefsSchema (key-based attachments)
apps/web/src/lib/upload/scoped-key.ts  key format + verification (new)
apps/web/src/lib/upload/quotas.ts      per-user storage quota (new)
apps/web/src/app/api/uploads/sign/route.ts  signed-URL minting (new)
apps/web/src/app/api/import/route.ts   JSON key body instead of multipart
apps/web/src/app/api/projects/[projectId]/upload/route.ts   same
apps/web/src/app/api/projects/[projectId]/chat/route.ts     key-based images
apps/web/src/lib/compile/wasm-engine.ts browser engine wrapper (new)
apps/web/src/lib/render-commit.ts      pdf_renders writer (new)
apps/web/src/app/api/projects/[projectId]/renders/route.ts  commit API (new)
apps/web/src/lib/render-client.ts      local compile state instead of SSE
apps/web/src/app/(app)/u/[projectId]/editor-client.tsx      compile orchestration
apps/web/src/components/pdf/pdf-chrome.tsx, lib/synctex-client.ts  signed GET
apps/web/next.config.ts                conditional standalone, CSP origins
vercel.json                            build + rewrites (new)
docs/serverless-deployment.md          provisioning and release runbook (new)
zenno/docs/2026-11-27-wasm-feasibility.md  spike decision record (new)
```

---

### Task 1: WASM engine feasibility spike

**Files:**
- Create: `zenno/docs/2026-11-27-wasm-feasibility.md`
- Modify: `zenno/specs/2026-11-27-free-serverless-deployment-design.md` (only if the answer is no-go)

**Interfaces:**
- Consumes: design §6 (browser WASM decision, external CDN asset).
- Produces: `EnginePick = { name: string; assetOrigin: string; packageOrigin: string; license: string; synctex: boolean; viable: boolean }`, recorded in the doc.

- [ ] **Step 1: Probe three candidate engines against the constraints**

Using `curl`/`npm view` only (no repo changes), record for BusyTeX, SwiftLaTeX and `wasmtex`: CDN asset size, whether assets can load cross-origin, package-server URL, license, and SyncTeX support. Confirm the CSP directives needed (`script-src`, `worker-src`, `connect-src`) from `apps/web/next.config.ts:32-45`.

- [ ] **Step 2: Write the decision record**

Write `zenno/docs/2026-11-27-wasm-feasibility.md` with the `EnginePick` table and an explicit `viable: true|false` line. If no engine is viable, record what fails and stop before Task 2, reporting back to the owner.

- [ ] **Step 3: Commit**

```bash
git add zenno/docs/2026-11-27-wasm-feasibility.md
git commit -m "docs: pick a browser WASM TeX engine"
```

### Task 2: Storage presigning and env foundation

**Files:**
- Modify: `packages/storage/src/index.ts`, `packages/shared/src/env.ts`, `apps/web/src/lib/env-example.test.ts`
- Create: `apps/web/src/lib/upload/scoped-key.ts`, `apps/web/src/lib/upload/scoped-key.test.ts`
- Modify: `packages/storage/src/index.test.ts`

**Interfaces:**
- Consumes: design §8 env contract.
- Produces:
  - `presignUpload(input: { bucket: Bucket; key: string; contentType: string; maxBytes: number; expiresInSeconds?: number }): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }>`
  - `presignDownload(bucket: Bucket, key: string, expiresInSeconds?: number): Promise<string>`
  - `UPLOAD_KINDS = ["import","workspace","chat-image","render"] as const`
  - `scopedKey(userId: string, kind: UploadKind, ext: string): string`
  - `assertScopedKey(userId: string, kind: UploadKind, key: string): boolean`

- [ ] **Step 1: Write failing tests**

`scoped-key.test.ts`: `scopedKey("u1","chat-image","webp")` matches `^u/u1/chat-image/[0-9a-f-]{36}\.webp$`; `assertScopedKey("u1","chat-image", "u/u2/chat-image/...")` is false; wrong kind false; malformed key false.

`index.test.ts`: `presignUpload` URL contains the bucket and encoded key, `X-Amz-Expires` ≤ 900, and `presignDownload` returns an `https:` URL.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run apps/web/src/lib/upload/scoped-key.test.ts packages/storage/src/index.test.ts`
Expected: FAIL (modules/exports not defined).

- [ ] **Step 3: Implement**

Add `@aws-sdk/s3-request-presigner` to `packages/storage/package.json`; read `S3_REGION ?? "auto"` and `S3_ENDPOINT` in the existing client; implement the two presign functions with a 900 s default expiry. Implement `scopedKey`/`assertScopedKey` with `crypto.randomUUID()` and a single anchored regex. Add the six `S3_*` values to `WebEnv` with the storage defaults and extend `env-example.test.ts`.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run apps/web/src/lib/upload/scoped-key.test.ts packages/storage/src/index.test.ts apps/web/src/lib/env-example.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storage apps/web/src/lib/upload packages/shared/src/env.ts apps/web/src/lib/env-example.test.ts pnpm-lock.yaml
git commit -m "feat(storage): add scoped keys and R2 presigning"
```

### Task 3: Signed-URL minting and storage quotas

**Files:**
- Create: `apps/web/src/app/api/uploads/sign/route.ts`, `apps/web/src/app/api/uploads/sign/route.test.ts`, `apps/web/src/lib/upload/quotas.ts`, `apps/web/src/lib/upload/quotas.test.ts`
- Modify: `packages/shared/src/rate-limit.ts`

**Interfaces:**
- Consumes: `scopedKey`, `assertScopedKey`, `presignUpload` from Task 2.
- Produces:
  - `SignUploadBody = { kind: UploadKind; ext: string; contentType: string; sizeBytes: number }`
  - `SignUploadResult = { key: string; url: string; headers: Record<string,string>; expiresAt: string }`
  - `consumeStorageQuota(userId: string, bytes: number): Promise<{ allowed: boolean; retryAfterMs: number }>`
  - `MAX_UPLOAD_BYTES: Record<UploadKind, number>` = import 26 MiB, workspace 30 MiB, chat-image 1 MiB, render 20 MiB.

- [ ] **Step 1: Write failing tests**

Route tests: unauthenticated → 401; `kind: "render"` by a non-owner project? (no project in body, so only auth + quota) → valid body returns a key accepted by `assertScopedKey(user.id, kind, key)`; oversize → 413; quota exhausted → 429. Quota test: two calls above the daily byte budget → second `allowed: false`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run apps/web/src/app/api/uploads/sign/route.test.ts apps/web/src/lib/upload/quotas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add `storageDay` and `signup` to `BUDGETS`. Implement `consumeStorageQuota` with `consume("storage:"+userId, BUDGETS.storageDay)` plus an approximate byte counter key. Route: `requireUser`, `assertSameOrigin`, `consumeStorageQuota`, zod body validation, `presignUpload("uploads", scopedKey(...), ...)`, return JSON with 201. All keys use the uploads bucket; render PDFs use the pdf bucket via a `bucket` field derived from `kind`.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run apps/web/src/app/api/uploads/sign/route.test.ts apps/web/src/lib/upload/quotas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/uploads/sign apps/web/src/lib/upload packages/shared/src/rate-limit.ts
git commit -m "feat(uploads): mint signed R2 upload URLs"
```

### Task 4: Import and workspace upload through R2

**Files:**
- Modify: `apps/web/src/app/api/import/route.ts`, `apps/web/src/app/api/projects/[projectId]/upload/route.ts`, `apps/web/src/lib/document-client.ts`, `apps/web/src/components/import/import-dialog.tsx`, `apps/web/src/components/upload/file-drop-overlay.tsx`
- Test: `apps/web/src/app/api/import/route.test.ts`, `apps/web/src/app/api/projects/[projectId]/upload/route.test.ts`

**Interfaces:**
- Consumes: `assertScopedKey`, `getObject`, `consumeStorageQuota`.
- Produces:
  - `ImportBody = { name: string; blobKey: string; contentType?: string }`
  - `UploadBody = { files: Array<{ name: string; blobKey: string; contentType?: string }> }`
  - `uploadBytesToR2(file: {bytes: Uint8Array; contentType: string; kind: UploadKind; ext: string; projectId?: string}): Promise<string>` in `apps/web/src/lib/upload/client.ts` (new; calls sign → PUT → returns key).

- [ ] **Step 1: Write failing tests**

Import route: JSON body with a valid scoped key returns a report; key under another user → 400; missing object → 400; over-cap object → 413. Upload route: foreign key → 400; owner key with two files → 201. Client helper: sign called first, PUT uses returned URL with `Content-Type`, returns key.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run apps/web/src/app/api/import/route.test.ts apps/web/src/app/api/projects/[projectId]/upload/route.test.ts apps/web/src/lib/upload/client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace `req.formData()` with `bodySchema.parse(await req.json())`; verify each `blobKey` with `assertScopedKey(user.id, kind, key)` before `getObject`; keep `assertZipMagic`, limits, rate limits and error mapping. Add `uploadBytesToR2` client helper and switch both UI components to it before posting the key.

- [ ] **Step 4: Run tests**

Run the same three files. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/import apps/web/src/app/api/projects apps/web/src/lib/upload apps/web/src/components/import apps/web/src/components/upload
git commit -m "feat(uploads): import and upload files via signed R2 keys"
```

### Task 5: Chat images by key, text-only path preserved

**Files:**
- Modify: `packages/shared/src/ai/images.ts`, `apps/web/src/app/api/projects/[projectId]/chat/route.ts`, `apps/web/src/lib/ai/image-attachments.ts`, `apps/web/src/app/(app)/u/[projectId]/composer/image-paste.ts`, `apps/web/src/app/(app)/u/[projectId]/composer/use-chat.ts`
- Test: `apps/web/src/app/api/projects/[projectId]/chat/route.test.ts`, `image-paste.test.ts`, `use-chat.test.ts`

**Interfaces:**
- Consumes: `assertScopedKey`, `getObject`, `chatImageRefsSchema` (new).
- Produces:
  - `ChatImageRef = { id: string; blobKey: string; mimeType: ImageMimeType; name: string }`
  - `chatImageRefsSchema` = zod array (max 4) of that shape.
  - `readPastedImages(items, upload: (bytes: Uint8Array, mimeType: ImageMimeType) => Promise<ChatImageRef>): Promise<ChatImageRef[]>`

- [ ] **Step 1: Write failing tests**

Route: key-based image request produces one text part + one `image_url` data URL; foreign key → 400; missing object → omitted marker, not 500; text-only request body and gateway content stay a plain string; after an image rejection a plain follow-up sends a string. `use-chat`: paste → sign+PUT → send key; rejection sets persistent omit flag and retry reuses `retryOfMessageId`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run apps/web/src/app/api/projects/'[projectId]'/chat/route.test.ts apps/web/src/app/'(app)'/u/'[projectId]'/composer/image-paste.test.ts apps/web/src/app/'(app)'/u/'[projectId]'/composer/use-chat.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add `chatImageRefsSchema` beside the existing base64 schema. In the route replace `chatImageAttachmentsSchema` with refs and `storeChatImage` with key verification + `getObject`; build `ImagePart` directly from the ref (server-generated `id` only if absent). Keep `withoutHistoryImages`, `retryWithoutImages`, `retryOfMessageId`, the 8 MiB declared-length guard and SSE events unchanged. Change `readPastedImages` to accept an upload callback; wire the composer to `uploadBytesToR2` with `kind: "chat-image"`.

- [ ] **Step 4: Run tests**

Run the same three files. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ai/images.ts apps/web/src/app/api/projects apps/web/src/lib/ai apps/web/src/app/'(app)'/u/'[projectId]'/composer
git commit -m "feat(chat): send images as signed R2 keys"
```

### Task 6: Browser WASM compiler

**Files:**
- Create: `apps/web/src/lib/compile/wasm-engine.ts`, `apps/web/src/lib/compile/wasm-engine.test.ts`
- Modify: `apps/web/src/lib/compile-request.ts`

**Interfaces:**
- Consumes: `EnginePick` from Task 1; `Diagnostic`, `ProjectStats` from `@spektrum/shared/compile`.
- Produces:
  - `CompileInput = { files: Record<string, string | Uint8Array>; mainFile: string }`
  - `CompileOutcome = { pdf: Uint8Array; log: string; synctex: Uint8Array | null; diagnostics: Diagnostic[]; stats: ProjectStats | null; durationMs: number; ok: boolean }`
  - `compileInBrowser(input: CompileInput, engine?: WasmEngineLike): Promise<CompileOutcome>` where `WasmEngineLike = { load(): Promise<void>; write(path: string, bytes: Uint8Array): Promise<void>; run(mainFile: string): Promise<CompileOutcome> }`.

- [ ] **Step 1: Write failing tests**

Inject a fake engine: `compileInBrowser` forwards every file path and main file, returns its outcome unchanged, and reports `ok:false` with diagnostics when the engine returns a non-zero status. A second test asserts the engine is loaded once across two calls with the same instance.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run apps/web/src/lib/compile/wasm-engine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Implement the wrapper with lazy engine load from the CDN origin recorded in Task 1, a Web Worker boundary, and in-memory file writes. Do not vendor engine assets. `enqueueProjectCompile` keeps its signature and rate-limit/cached semantics but returns `{kind:"enqueued", revision}` for browser-side work (no BullMQ call).

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run apps/web/src/lib/compile/wasm-engine.test.ts apps/web/src/lib/compile-request.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/compile apps/web/src/lib/compile-request.ts
git commit -m "feat(compile): add browser WASM compiler wrapper"
```

### Task 7: Ownership-checked render result commit

**Files:**
- Create: `apps/web/src/lib/render-commit.ts`, `apps/web/src/lib/render-commit.test.ts`, `apps/web/src/app/api/projects/[projectId]/renders/route.ts`, `apps/web/src/app/api/projects/[projectId]/renders/route.test.ts`
- Delete: `apps/web/src/app/api/projects/[projectId]/render/stream/route.ts`

**Interfaces:**
- Consumes: `getProject`, `assertScopedKey`, `pdfRenders` schema, `CompileOutcome` from Task 6.
- Produces:
  - `CommitRenderBody = { revision: string; mainFile: string; pdfKey: string; synctexKey: string | null; log: string | null; diagnostics: Diagnostic[] | null; stats: ProjectStats | null; durationMs: number | null }`
  - `commitRender(userId: string, projectId: string, body: CommitRenderBody): Promise<{ revision: string }>` — upserts on `(projectId, revision)`, status `ok`.

- [ ] **Step 1: Write failing tests**

Owner commit inserts a `pdf_renders` row readable by `getLatestRender`; second commit for the same revision updates rather than duplicates; non-owner → `not_found`; foreign `pdfKey` → 400; missing object key → 400.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run apps/web/src/lib/render-commit.test.ts apps/web/src/app/api/projects/'[projectId]'/renders/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Validate keys with `assertScopedKey(userId, "render", key)` and existence with `getObject` (or `headObject`); write with Drizzle `onConflictDoUpdate` on the unique index; route uses `requireUser`, `assertSameOrigin`, zod body and `errorResponse`. Delete the server render SSE route and its client subscription.

- [ ] **Step 4: Run tests**

Run the two test files plus `apps/web/src/lib/render-store.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/render-commit* apps/web/src/app/api/projects apps/web/src/lib/render-client.ts
git commit -m "feat(compile): commit browser compile results with ownership checks"
```

### Task 8: Editor, PDF and SyncTeX clients use local compile state

**Files:**
- Modify: `apps/web/src/lib/render-client.ts`, `apps/web/src/lib/compile-client.ts`, `apps/web/src/lib/synctex-client.ts`, `apps/web/src/lib/ai/tools.ts`, `apps/web/src/components/pdf/pdf-chrome.tsx`, `apps/web/src/app/(app)/u/[projectId]/editor-client.tsx`
- Test: `apps/web/src/lib/render-client.test.ts`, `apps/web/src/components/pdf/pdf-chrome.test.tsx`, `editor-client.test.tsx`, `apps/web/src/lib/ai/tools.test.ts`

**Interfaces:**
- Consumes: `compileInBrowser`, `commitRender`, `presignDownload`.
- Produces: `useLocalCompile(projectId): { status: RenderEvent | null; start(mainFile: string): Promise<void> }` replacing `useRenderStream`.

- [ ] **Step 1: Write failing tests**

`useLocalCompile` emits queued → compiling → result events from the fake compiler, uploads PDF/log via signed URLs, then POSTs `CommitRenderBody`; a failed compile emits an error event and does not commit. `pdf-chrome` renders a PDF passed as bytes; `synctex-client` fetches a signed URL for the synctex key.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run apps/web/src/lib/render-client.test.ts apps/web/src/components/pdf/pdf-chrome.test.tsx apps/web/src/app/'(app)'/u/'[projectId]'/editor-client.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace the `EventSource` subscription with the local hook; keep the `RenderEvent` shape so status pills and logs work unchanged. Preserve Ctrl+S save and autosave behaviour in `editor-client.tsx`. Change the AI `compile` tool so it no longer polls for a server render that will never exist: it must ask the user to compile in the editor (or return the current committed render), not time out after 35 s.

- [ ] **Step 4: Run tests**

Run the three files. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/render-client.ts apps/web/src/lib/compile-client.ts apps/web/src/lib/synctex-client.ts apps/web/src/components/pdf apps/web/src/app/'(app)'/u/'[projectId]'/editor-client.tsx
git commit -m "feat(compile): drive the editor from local WASM compile state"
```

### Task 9: Public signup, quotas and auth build gate

**Files:**
- Modify: `packages/shared/src/rate-limit.ts`, `.env.example`, `apps/web/src/auth/auth.ts`
- Test: `packages/shared/src/env.test.ts`, `apps/web/src/auth/signup-gate.test.ts`, `packages/shared/src/rate-limit.test.ts`

**Interfaces:**
- Consumes: `ALLOW_PUBLIC_SIGNUP` from `loadWebEnv()`.
- Produces: `BUDGETS.signup` and `BUDGETS.storageDay`; no code default change for `allowPublicSignup`.

- [ ] **Step 1: Write failing tests**

Env test: `loadWebEnv({})` still yields `allowPublicSignup === false` and `"true"` yields true (guards `main`). Signup gate: allowed when env true, denied otherwise; admin role never granted by public signup. Rate-limit test: new budgets present with exact values (signup 3 / 15 min; storageDay 1 / day as a coarse daily counter).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run packages/shared/src/env.test.ts apps/web/src/auth/signup-gate.test.ts packages/shared/src/rate-limit.test.ts`
Expected: FAIL on budget assertions.

- [ ] **Step 3: Implement**

Add the budgets; leave `signup-gate.ts` and the env default untouched; document that the Vercel env var is the only switch. Add a build-time test that importing `auth.ts` hashes and verifies a password, to catch Argon2 native failures; if it fails on the Vercel build image, add a pure-JS fallback before launch.

- [ ] **Step 4: Run tests**

Run the three files. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/rate-limit.ts packages/shared/src/rate-limit.test.ts .env.example apps/web/src/auth
git commit -m "feat(auth): guard public signup and free-tier quotas"
```

### Task 10: Stateless Redis adapter

**Files:**
- Modify: `packages/shared/src/rate-limit.ts`
- Create: `packages/shared/src/rate-limit-rest.ts`, `packages/shared/src/rate-limit-rest.test.ts`

**Interfaces:**
- Consumes: `REDIS_URL` or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
- Produces: `RedisLike = { eval(...): Promise<unknown>; get(...): Promise<string|null>; set(...): Promise<unknown>; incr(...): Promise<number>; del(...): Promise<number>; expire(...): Promise<number>; quit(): Promise<void> }`, and `getRedis(): RedisLike`.

- [ ] **Step 1: Write failing test**

With only REST env vars set, `getRedis()` returns an adapter whose `eval`, `get`, `set`, `incr`, `del`, `expire` and `quit` forward to a fake HTTP client with the expected command payloads; `consume()` works against the fake.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run packages/shared/src/rate-limit-rest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Extract `RedisLike`, keep the ioredis path when `REDIS_URL` is set, add a REST implementation when Upstash REST vars are present. If the resolved adapter cannot support pub/sub, note that chat SSE must use DB polling on this branch and add it to the docs; do not silently drop SSE.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run packages/shared/src/rate-limit-rest.test.ts packages/shared/src/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/rate-limit.ts packages/shared/src/rate-limit-rest.ts packages/shared/src/rate-limit-rest.test.ts
git commit -m "feat(serverless): support stateless Redis access"
```

### Task 11: Vercel config, CSP, docs and final verification

**Files:**
- Create: `vercel.json`, `docs/serverless-deployment.md`, `apps/web/src/lib/serverless-config.ts`, `apps/web/src/lib/serverless-config.test.ts`
- Modify: `apps/web/next.config.ts`, `docs/README.md`, `README.md`, `docs/ai-and-chat.md`, chat route (`maxDuration` export), renders route (`maxDuration` export)

**Interfaces:**
- Consumes: all previous tasks.
- Produces: `cspOrigins(): string[]` from env; documented production URL and release checklist.

- [ ] **Step 1: Write failing tests**

Config test: CSP includes allowlisted engine CDN, package server and R2 endpoint origins from env when set, and stays `'self'`-only when unset; `next.config.ts` does not emit `output: "standalone"` when `VERCEL === "1"`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run apps/web/src/lib/serverless-config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Implement `cspOrigins()` in `apps/web/src/lib/serverless-config.ts` and consume it from `next.config.ts`; add `vercel.json` with the web build command and rewrites for engine assets; make standalone output conditional on `VERCEL !== "1"`; export `maxDuration = 300` from chat and renders routes; write the deployment doc with Neon/Upstash/R2 provisioning, env table, local migration/owner bootstrap, public-signup flip, BYOK onboarding, quotas, backups and known limits; link it from both READMEs and `docs/ai-and-chat.md`.

- [ ] **Step 4: Verify everything**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all green. Then read the smoke checklist in `docs/serverless-deployment.md` and confirm every step is executable on a fresh Vercel project.

- [ ] **Step 5: Commit**

```bash
git add vercel.json apps/web/next.config.ts docs README.md
git commit -m "feat(deploy): add Vercel config and serverless runbook"
```
