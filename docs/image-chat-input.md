# Image input in the AI chat

This document is the complete guide to how pasted images work in Spektrum: what
the user sees, what crosses the wire, where bytes are stored, and how the system
recovers when a model cannot accept images. For the short user-facing summary,
see [AI providers and chat](ai-and-chat.md#image-input-capability-limits-and-retry).

## 1. What the user can do

- Paste a screenshot into the chat composer with Ctrl/Cmd+V (drag-and-drop is
  not implemented in this release).
- See a thumbnail above the composer with a remove button; up to 4 images can be
  queued.
- Send the images with the message on Enter. Images are **chat attachments**,
  not workspace files: they never appear in the file tree and never change the
  compile revision.
- Ask follow-up questions in the same thread. Recent images stay in the model's
  context, within a fixed budget, like ChatGPT or a coding harness.
- If the gateway rejects images, click **Retry without images**. From then on,
  all later messages in that thread omit stored history images so the thread
  stays usable. **New chat** clears that state.

## 2. End-to-end flow

```
Clipboard ──paste──▶ composer (downscale/encode, ≤1 MiB each)
                    │  thumbnail: blob: URL
                    ▼
              POST /api/uploads/sign → PUT signed R2 URL (bytes bypass the app)
                    │  key: u/<userId>/chat-image/<uuid>.<ext> (server-scoped)
                    ▼
              POST /api/projects/:id/chat
              { message, images: [{id, blobKey, mimeType, name}], omitHistoryImages?, retryOfMessageId? }
                    │  413 if content-length > 8 MiB (Vercel's 4.5 MB cap applies first)
                    │  zod: ≤4 refs, MIME allowlist; server verifies key owner/kind,
                    │  getObject and actual size ≤1 MiB before persisting the key
                    ▼
              persisted as an `image` part on the user message (blobKey, never bytes)
                    ▼
              buildUserContent(text, current images, recent history images)
                    │  ≤4 images, ≤4 MiB decoded; older → omission marker
                    ▼
              streamGateway → POST <baseUrl>/chat/completions
                    content: string | [text part, data:<mime>;base64 image_url parts…]
                    ▼
              SSE events → transcript (local blob: URL or owner-only thumbnail route)
```

## 3. Capability detection

There is no single standard capability field on OpenAI-compatible `/v1/models`
endpoints. Spektrum therefore uses a three-valued signal, never a boolean:

| Detected value | Meaning |
|---|---|
| `yes` | Metadata or known id says the model accepts image input |
| `no` | Catalog explicitly lists text-only modalities |
| `unknown` | No usable signal — try anyway and show a notice |

Signals are read in this order: `architecture.input_modalities`,
`input_modalities`, `capabilities.input_modalities`, `modalities.input`,
`architecture.modality`, `type: "vlm"`, boolean vision flags, then a small
static allowlist for OpenAI-style flat ids (`gpt-4o`, `gemini-*`, `claude-*`, …).
`unknown` is never coerced to `no`.

The user override lives in **Settings → Integrations → Image input**:

- **Auto** — never blocks an attachment; shows a non-blocking notice when the
  model looks text-only or the signal is unknown.
- **Force on** — suppresses the notice and keeps attachments.
- **Force off** — strips attachments before send.

`resolveImageCapability()` in `apps/web/src/lib/ai/image-capability.ts` is the
single client-side resolver used by the composer. **The chat route never checks
capability** — it validates and forwards whatever images arrive. This keeps one
decision path and lets custom gateways work.

## 4. Data shapes

Attachment on the wire from the browser (`ChatImageRef`):

```ts
{ id: string; blobKey: string; // u/<userId>/chat-image/<uuid>.<ext>, signed PUT
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  name: string }
```

The older inline-base64 `ChatImageAttachment` shape is no longer accepted by
the chat route: the browser uploads bytes directly to R2 so no serverless
function sees them.

Persisted message part (`MessagePart` union):

```ts
{ type: "image"; id: string; blobKey: string; name: string; mimeType: string }
```

Gateway user content:

```ts
"plain text" // text-only path, unchanged from before this feature
// or
[
  { type: "text", text: "…" },
  { type: "image_url", image_url: { url: "data:image/png;base64,..." } },
]
```

`detail` is never sent; most compatible providers ignore or reject it.

## 5. Browser pipeline

`readPastedImages()` (`apps/web/src/app/(app)/u/[projectId]/composer/image-paste.ts`):

1. Accepts only `image/png`, `image/jpeg`, `image/webp`, `image/gif`; rejects
   non-image clipboard items and enforces a source `file.size` cap before
   decoding.
2. `createImageBitmap` → canvas downscale so the longest edge is ≤ **1536 px**.
3. Encodes WebP at decreasing quality, falls back to JPEG, and stops as soon as
   the result is ≤ **1 MiB**. The returned MIME comes from the actual
   `blob.type`, so a WebP-to-PNG browser fallback is labelled correctly.
4. Requests a signed PUT URL from `/api/uploads/sign` for the `chat-image`
   kind, PUTs the encoded bytes straight to R2, and sends only the returned
   `blobKey` to the chat route; source metadata/EXIF is dropped by re-encoding.

The composer keeps optimistic thumbnails as `URL.createObjectURL()` values and
revokes them on reset, thread load, and unmount.

## 6. Storage and thumbnails

- `/api/uploads/sign` mints a short-lived PUT URL for a **server-scoped** key
  `u/<userId>/chat-image/<uuid>.<ext>` in the **uploads** R2 bucket; the browser
  PUTs the bytes there. The chat route's `resolveChatImageRef()` rejects keys
  outside that prefix/kind, re-reads the object with `getObject`, and enforces
  the 1 MiB cap on the **actual** size before persisting the key. The byte
  budget was already charged when the URL was minted. A client-supplied `id`
  survives only as a display `name`; duplicate client ids cannot collide.
- Live thumbnails use the optimistic `blob:` URL. After reload, thumbnails come
  from
  `GET /api/projects/:projectId/chat/attachments/:attachmentId?threadId=...`.
- That route checks `requireUser` → `getThread` (project owner only) →
  `findImagePart` → `getObject`. Every miss is a 404 with no bytes; responses set
  `cache-control: private` and `x-content-type-options: nosniff`.
- `deleteChatImages()` runs on thread deletion; `deleteProjectChatImages()` runs
  on owner-scoped project deletion, so a cross-tenant no-op stays a no-op.

## 7. History retention and the text-only guarantee

`recentTurns()` now returns `HistoryTurn[]` with `{ role, text, images }` and
drops turns with neither text nor images (tool-only turns stay out of the system
prompt, as before).

`buildUserContent()` combines the current attachments with images from recent
history, newest first, applying two caps:

- at most **4 images** per request (checked before any S3 read);
- at most **4 MiB** total decoded bytes.

Dropped images are represented in the request by
`[image omitted — re-attach to discuss]`. A missing/unreadable blob is treated
as omitted rather than failing the whole request. Text-only threads return the
original string unchanged — byte-for-byte the old path.

## 8. Rejection and recovery

The route marks an image-related HTTP 400 with a structured SSE field
`retryWithoutImages: true` and the suffix `"Retry without images."`. The client:

- sets `imageRejected` (shows the button) and a persistent `omitHistoryImages`
  ref for the thread;
- on retry, sends `retryWithoutImages: true`, `omitHistoryImages: true`, and
  `retryOfMessageId` (the failed user row id);
- on all later sends in that thread, sends `omitHistoryImages: true`;
- on **New chat**, clears both states.

On the server:

- `withoutHistoryImages()` strips images from **all** history turns when either
  `omitHistoryImages` or `retryWithoutImages` is set, so a plain follow-up after
  a rejection cannot re-attach the bad image and brick the thread;
- with `retryOfMessageId`, the route skips blob re-storage and the duplicate
  user-row insert, and emits the reused id in `meta.userMessageId`;
- a request declaring more than **8 MiB** is rejected with 413 before JSON
  parsing and before the rate limiter.

The original images stay stored and visible in the transcript; only the gateway
payload omits them. Rejection state is session-scoped: reloading a thread by URL
after a rejection loses the omit flag (known limitation).

## 9. Limits and security

| Limit | Value |
|---|---|
| Images per request | 4 |
| Decoded bytes per image | 1 MiB |
| Decoded history budget | 4 MiB |
| Browser downscale | 1536 px longest edge |
| Request body | 8 MiB declared `content-length` → 413 (Vercel: 4.5 MB platform cap first) |
| MIME allowlist | PNG, JPEG, WebP, GIF |
| Key prefix | `u/<userId>/chat-image/` (any other owner or kind is rejected) |
| Thumbnail visibility | Project owner only |

The browser sends keys, not base64; only the gateway payload is re-encoded as a
data URL from the R2 bytes. The server validates the key, the MIME allowlist and
the object's real size; the browser-side downscale is a convenience, not the
security boundary.

## 10. File map

| Area | Files |
|---|---|
| Contracts | `packages/shared/src/ai/images.ts`, `packages/shared/src/ai.ts`, `packages/shared/src/preferences.ts` |
| Capability | `apps/web/src/lib/ai/model-capabilities.ts`, `apps/web/src/lib/ai/image-capability.ts`, `apps/web/src/lib/ai/models.ts` |
| Storage | `apps/web/src/lib/ai/image-attachments.ts`, `apps/web/src/app/api/uploads/sign/route.ts`, `apps/web/src/lib/upload/{scoped-key.ts,quotas.ts,client.ts}`, `apps/web/src/app/api/projects/[projectId]/chat/attachments/[attachmentId]/route.ts` |
| Protocol/history | `apps/web/src/lib/ai/multimodal.ts`, `apps/web/src/lib/ai/gateway.ts`, `apps/web/src/lib/ai/chat-store.ts`, `apps/web/src/lib/ai/context.ts` |
| Route | `apps/web/src/app/api/projects/[projectId]/chat/route.ts` |
| UI | `apps/web/src/app/(app)/u/[projectId]/composer/{composer.tsx,use-chat.ts,transcript.tsx,image-paste.ts}`, `apps/web/src/components/settings/sections/integrations-section.tsx` |
| Tests | matching `*.test.ts(x)` files plus `e2e/images.spec.ts` |

## 11. Troubleshooting

- **"The model may not accept images"** — `Auto` mode with a `no`/`unknown`
  signal. It is not a block; try anyway or switch model.
- **Gateway 400 mentioning images** — use **Retry without images**, or switch to
  a multimodal model. Later messages in the thread automatically omit history
  images.
- **Thumbnail missing after reload** — the owner-only route requires the active
  thread id; check that you are the project owner and that the blob was not
  deleted with its thread.
- **Image disappeared after paste** — the type was outside the allowlist, the
  source was too large, the signed PUT failed (check R2 CORS allows PUT from the
  app origin), or **Force off** is set.
