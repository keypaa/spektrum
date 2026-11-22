# Image input in the AI chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user paste images into the AI chat, send them to multimodal models, see them in the transcript, and have recent images stay in context on later turns within a bounded budget.

**Architecture:** Capability detection is a three-valued, best-effort signal parsed from `/v1/models` metadata and overridden in Settings; the chat route never uses it to strip images. Pasted images are downscaled in the browser, validated and stored as S3 blobs with `image` message parts, and assembled into OpenAI-compatible content arrays with the last 4 images / 4 MiB. History becomes multimodal so follow-ups retain visual context; older images are replaced by an omission marker.

**Tech Stack:** TypeScript, Next.js 16 route handlers, Zod, Drizzle/Postgres, S3-compatible storage, Vitest + Testing Library, Playwright for the mock-gateway e2e.

**Spec:** `zenno/specs/2026-11-22-image-input-in-chat-design.md`

## Global Constraints

- Node 26.13.0 and pnpm 12.18.0 only (pinned in `.node-version`, `.mise.toml`, `package.json`, `.npmrc`).
- No provider SDKs: every call goes through the OpenAI-compatible `/v1/chat/completions` gateway.
- Image MIME allowlist: `image/png`, `image/jpeg`, `image/webp`, `image/gif`.
- Caps: max 4 images per request, 1 MiB decoded per image, 4 MiB total decoded history budget; browser downscales longest edge to 1536 px.
- Image parts use `data:<mime>;base64,...` in gateway requests; never send `detail`.
- Text-only requests keep `content` as a plain string, byte-for-byte as today.
- Attachment thumbnails are owner-only, matching current thread visibility (`getThread` uses `projects.ownerId = userId`).
- Pasted images are chat attachments, not workspace files: they do not enter the file tree or the compile revision.

## Review Focus

These are the inputs most likely to break in real use; each is pinned by a test in the owning task.

1. Text-only model receiving an image → must produce an actionable 400 message with "Retry without images", not a silent hang. Pin: Task 5 error-event test.
2. Oversized or invalid paste (20 MB PNG, GIF with 500 frames, wrong MIME) → must be rejected/downscaled before base64, never sent raw. Pin: Task 1 schema test and Task 6 paste test.
3. Long thread with many images → must not grow requests without bound; oldest images become `[image omitted — re-attach to discuss]`. Pin: Task 4 budget test.
4. Another user or non-owner guessing an attachment URL → 404, never bytes. Pin: Task 3 ownership test.
5. "Retry without images" → must not duplicate the failed turn or leak blobs. Pin: Task 7 retry + cleanup test.

---

### Task 1: Shared image contracts and limits

**Files:**
- Create: `packages/shared/src/ai/images.ts`
- Modify: `packages/shared/src/ai.ts:43-54` (MessagePart), re-export images module
- Modify: `packages/shared/src/preferences.ts:29-37` (llm config schema)
- Test: `packages/shared/src/ai/images.test.ts`

**Interfaces:**
- Produces: `ChatImageAttachment` zod schema (`{ id: string; mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string }`), `IMAGE_LIMITS = { maxCount: 4, maxBytesPerImage: 1024 * 1024, maxHistoryBytes: 4 * 1024 * 1024, maxEdge: 1536 }`, `imageSupportSchema` (`"auto" | "on" | "off"`), `MessagePart` image variant `{ type: "image"; id: string; blobKey: string; name: string; mimeType: string }`, and `llm.imageSupport` default `"auto"`.

- [ ] **Step 1: Write failing tests for attachment validation**

```ts
it("accepts four small PNG attachments", ...);
it("rejects a fifth attachment", ...);
it("rejects base64 that decodes over 1 MiB", ...);
it("rejects image/bmp", ...);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm exec vitest run packages/shared/src/ai/images.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `images.ts`, the MessagePart variant, and the preference field**

Use Zod `.max(4)` on the array, `.refine` on decoded byte length from `Buffer.from(data, "base64")`, and `.strict()` for the preference. Add the image variant to `MessagePart` without changing existing variants.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm exec vitest run packages/shared/src/ai/images.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ai/images.ts packages/shared/src/ai/images.test.ts packages/shared/src/ai.ts packages/shared/src/preferences.ts
git commit -m "feat(ai): add image attachment contracts and limits"
```

---

### Task 2: Three-valued capability detection from /v1/models

**Files:**
- Create: `apps/web/src/lib/ai/model-capabilities.ts`
- Modify: `apps/web/src/lib/ai/models.ts:4-69`
- Test: `apps/web/src/lib/ai/model-capabilities.test.ts`

**Interfaces:**
- Consumes: raw `/models` JSON objects from any provider.
- Produces: `detectImageSupport(raw: Record<string, unknown>, id: string): "yes" | "no" | "unknown"` and `ModelInfo.imageSupport`; `listModels()` returns the new field without changing its signature.

- [ ] **Step 1: Write failing tests for every observed metadata shape**

```ts
it("detects image from architecture.input_modalities", ...);
it("detects image from architecture.modality 'text+image->text'", ...);
it("detects type 'vlm'", ...);
it("returns yes for a known OpenAI vision id with no metadata", ...);
it("returns no when the catalog explicitly lists only text", ...);
it("returns unknown for an unrecognised custom model", ...);
```

Use the real Kilo payload shape: `architecture.input_modalities` for `anthropic/claude-opus-5.5` (`["text","image"]`) and `baidu/ernie-5.5-flash-preview:free` (`["text"]`).

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm exec vitest run apps/web/src/lib/ai/model-capabilities.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement detection and extend `listModels()`**

Check fields in the order in the design doc. `unknown` never becomes `no`; only explicit text-only catalog data yields `no`. Extend `ModelInfo` with `imageSupport`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm exec vitest run apps/web/src/lib/ai/model-capabilities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ai/model-capabilities.ts apps/web/src/lib/ai/model-capabilities.test.ts apps/web/src/lib/ai/models.ts
git commit -m "feat(ai): detect image support from model metadata"
```

---

### Task 3: Attachment storage, lookup and owner-only thumbnail route

**Files:**
- Create: `apps/web/src/lib/ai/image-attachments.ts`
- Create: `apps/web/src/app/api/projects/[projectId]/chat/attachments/[attachmentId]/route.ts`
- Modify: `apps/web/src/lib/ai/chat-store.ts:283-321` (add `findImagePart`)
- Test: `apps/web/src/lib/ai/image-attachments.test.ts`, new route test

**Interfaces:**
- Consumes: `ChatImageAttachment`, `MessagePart` image variant, `getObject`/`putObject` from `@spektrum/storage`, `getThread` from chat-store.
- Produces: `storeChatImage(userId, projectId, attachment): Promise<{ blobKey: string; part: Extract<MessagePart, { type: "image" }> }>`; `readChatImage(blobKey): Promise<Buffer>`; `findImagePart(threadId, attachmentId): Promise<Extract<MessagePart, { type: "image" }> | null>`; route `GET /api/projects/:projectId/chat/attachments/:attachmentId?threadId=...`.

- [ ] **Step 1: Write failing storage and ownership tests**

```ts
it("stores an attachment under chat/<projectId>/<uuid>", ...);
it("reads the bytes back", ...);
it("returns null for an attachment in another user's thread", ...);
it("returns 404 from the thumbnail route for a non-owner", ...);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm exec vitest run apps/web/src/lib/ai/image-attachments.test.ts <new-route-test>`
Expected: FAIL.

- [ ] **Step 3: Implement blob helpers, chat-store lookup and the route**

Use `getDocumentObject`-style S3 access; scope the route with `requireUser` → `getThread({ threadId, userId })` → `findImagePart` → 404 on any miss. Set `content-type` from the part's MIME and `cache-control: private`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: the same two test paths.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ai/image-attachments.ts apps/web/src/lib/ai/image-attachments.test.ts apps/web/src/app/api/projects/'[projectId]'/chat/attachments apps/web/src/lib/ai/chat-store.ts
git commit -m "feat(chat): store and serve image attachments"
```

---

### Task 4: Bounded multimodal history and gateway content arrays

**Files:**
- Create: `apps/web/src/lib/ai/multimodal.ts`
- Modify: `apps/web/src/lib/ai/gateway.ts:11-16` (GatewayMessage.content union)
- Modify: `apps/web/src/lib/ai/chat-store.ts:283-303` (recentTurns returns parts)
- Modify: `apps/web/src/lib/ai/context.ts` (history formatting stays text-only)
- Test: `apps/web/src/lib/ai/multimodal.test.ts`, updated chat-store tests

**Interfaces:**
- Consumes: `MessagePart[]` from recentTurns; `readChatImage` from Task 3.
- Produces: `HistoryTurn = { role: "user" | "assistant"; text: string; images: Extract<MessagePart, { type: "image" }>[] }`; `recentTurns()` returns `HistoryTurn[]`; `buildUserContent(text, currentImages, history): Promise<string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>>`; `GatewayMessage.content` accepts that union.

- [ ] **Step 1: Write failing budget and shape tests**

```ts
it("returns a plain string when there are no images", ...);
it("builds one text part plus image parts for a new message", ...);
it("includes recent history images on a later turn", ...);
it("drops oldest images past four, replacing them with [image omitted — re-attach to discuss]", ...);
it("drops oldest images past 4 MiB decoded", ...);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm exec vitest run apps/web/src/lib/ai/multimodal.test.ts apps/web/src/lib/ai/chat-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement multimodal history assembly**

`recentTurns()` keeps the last 40 rows but returns image parts alongside text. `buildUserContent` combines current attachments with history images, newest first, applying both caps, and reads bytes only for retained images. Context/history text formatting ignores image parts.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: the same two test paths.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ai/multimodal.ts apps/web/src/lib/ai/multimodal.test.ts apps/web/src/lib/ai/gateway.ts apps/web/src/lib/ai/chat-store.ts apps/web/src/lib/ai/context.ts
git commit -m "feat(ai): assemble bounded multimodal chat history"
```

---

### Task 5: Chat route integration and image-error handling

**Files:**
- Modify: `apps/web/src/app/api/projects/[projectId]/chat/route.ts:40-55,127-186`
- Test: `apps/web/src/app/api/projects/[projectId]/chat/route.test.ts`

**Interfaces:**
- Consumes: `ChatImageAttachment`, `storeChatImage`, `buildUserContent`, `streamGateway`.
- Produces: extended POST body with `images?: ChatImageAttachment[]`; persisted user parts include `image` parts; the local `messages` array's first user entry uses `GatewayMessage["content"]`; gateway receives multimodal user content on step 0.

- [ ] **Step 1: Write failing route tests**

```ts
it("stores images and persists image parts on the user message", ...);
it("sends a content array to the gateway when images are present", ...);
it("emits error event with retryable:false for an image rejection", ...);
```

Mock `streamGateway` to throw `GatewayHttpError(400, ...)` containing "image" and assert the error event message.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm exec vitest run "apps/web/src/app/api/projects/[projectId]/chat/route.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Extend the route**

Add `images` to the zod body. Before `appendMessage`, call `storeChatImage` for each attachment and append its part. Build step-0 user content with `buildUserContent`. Keep later tool steps' user content unchanged.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: the same route test.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/projects/'[projectId]'/chat/route.ts apps/web/src/app/api/projects/'[projectId]'/chat/route.test.ts
git commit -m "feat(chat): accept image attachments in the chat route"
```

---

### Task 6: Composer paste, downscale and capability notice

**Files:**
- Create: `apps/web/src/app/(app)/u/[projectId]/composer/image-paste.ts`
- Modify: `apps/web/src/app/(app)/u/[projectId]/composer/composer.tsx:58-120,220-272`
- Modify: `apps/web/src/app/(app)/u/[projectId]/composer/use-chat.ts:119-152` (send signature adds images)
- Modify: `apps/web/src/components/settings/sections/integrations-section.tsx` (Auto/on/off control)
- Test: `image-paste.test.ts`, `composer.test.tsx`, `use-chat.test.ts`

**Interfaces:**
- Consumes: `IMAGE_LIMITS`, `ModelInfo.imageSupport`, `llm.imageSupport` override.
- Produces: `readPastedImages(items: DataTransferItemList): Promise<ChatImageAttachment[]>`; `useChat.send(..., images?: ChatImageAttachment[])`.

- [ ] **Step 1: Write failing tests**

```ts
it("downscales a 3000px image to 1536px and encodes WebP", ...);
it("rejects a non-image clipboard item", ...);
it("shows thumbnails and removes one on click", ...);
it("sends attachments with the message", ...);
it("shows a warning when capability is 'no' or override is 'off'", ...);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm exec vitest run apps/web/src/app/'(app)'/u/'[projectId]'/composer`
Expected: FAIL.

- [ ] **Step 3: Implement paste handling and composer UI**

Use `createImageBitmap` + canvas for downscale/encode. Guard `Force off` by not attaching. Do not block on `unknown`/`no` — show a non-blocking notice. Extend `send` to pass `images` in the POST body.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: the composer test directory.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/'(app)'/u/'[projectId]'/composer apps/web/src/components/settings/sections/integrations-section.tsx
git commit -m "feat(chat): paste and send images"
```

---

### Task 7: Transcript thumbnails, retry-without-images, blob cleanup

**Files:**
- Modify: `apps/web/src/app/(app)/u/[projectId]/composer/transcript.tsx:58-110`
- Modify: `apps/web/src/app/(app)/u/[projectId]/composer/use-chat.ts:297-335` (retry/rerun)
- Modify: `apps/web/src/lib/ai/chat-store.ts` (deletion hooks alongside thread/project deletion)
- Test: `transcript.test.tsx`, `use-chat.test.ts`, `chat-store.test.ts`

**Interfaces:**
- Consumes: image MessagePart, thumbnail route URL, `lastSend` from useChat.
- Produces: thumbnail rendering in user bubbles; `retry()` sends text only when the prior turn had images; deletion removes attachment blobs.

- [ ] **Step 1: Write failing tests**

```ts
it("renders a thumbnail for an image part", ...);
it("retry without images reuses the same turn and omits images", ...);
it("deleting a thread deletes its attachment blobs", ...);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: the three test paths.
Expected: FAIL.

- [ ] **Step 3: Implement rendering, retry flag and cleanup**

Add `data-testid="user-image"` to thumbnails. On an image-related error, `retry()` calls `send(text, ..., [])` without appending a new user part. Add `deleteChatImages(threadId)` called from existing thread/project deletion paths.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: the three test paths.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/'(app)'/u/'[projectId]'/composer apps/web/src/lib/ai/chat-store.ts
git commit -m "feat(chat): show attachments and support retry without images"
```

---

### Task 8: Mock-gateway e2e and docs

**Files:**
- Create: `e2e/images.spec.ts`
- Modify: `playwright.ai.config.ts` (include the new spec)
- Modify: `docs/ai-and-chat.md`
- Test: `e2e/images.spec.ts`

**Interfaces:**
- Consumes: all previous tasks.

- [ ] **Step 1: Write the e2e test**

Drive the mock gateway: paste a tiny PNG, assert the request body has one text part plus one image part, assert a follow-up still includes the image, assert a text-only message after "New chat" sends a string.

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec playwright test --config playwright.ai.config.ts e2e/images.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Wire the mock gateway if needed and document the feature**

Add image support to the mock gateway response assertions only; update `docs/ai-and-chat.md` with paste, capability, budget and retry behaviour.

- [ ] **Step 4: Run the e2e test and confirm it passes**

Run: the same Playwright command.
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

```bash
git add e2e/images.spec.ts playwright.ai.config.ts docs/ai-and-chat.md
git commit -m "test+docs: cover image input in chat"
```
