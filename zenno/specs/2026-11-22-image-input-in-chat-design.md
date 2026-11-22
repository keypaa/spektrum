# Design: image input in the AI chat

Status: **proposal / research result**. No product code has been built yet.

## Intent

Let a user paste (or drop) an image into the chat composer and send it with a
question, across any of the OpenAI-compatible providers Spektrum already
supports. The hard part is not the UI — it is deciding whether the selected
model accepts images, because the providers all expose `/v1/chat/completions`
but do not all expose capability metadata.

## Research findings

### What `/v1/models` actually returns

| Provider family | Capability evidence in `GET /models` |
|---|---|
| OpenRouter, and Kilo Code's gateway (which mirrors the OpenRouter catalog) | Yes: `architecture.input_modalities`, e.g. `["text","image"]`; also `architecture.modality` like `text+image->text`, and `supported_parameters` |
| Newer OpenAI-compatible gateways (e.g. GlobalRouter, DiCompute) | Sometimes: `input_modalities`, `capabilities.vision`, `modality` |
| LM Studio | Sometimes `type: "vlm"` |
| OpenAI official | **No** — `id`, `object`, `created`, `owned_by` only |
| Many self-hosted / custom `/v1` endpoints | **No** — OpenAI's model object has no capability field |

Verified live against `https://api.kilo.ai/api/gateway/models`: models such as
`anthropic/claude-opus-5.5`, `openai/gpt-6.2-sol`, `google/gemini-4-neon` and
`tencent/hy4` report `image` in `architecture.input_modalities`; the currently
configured default `baidu/ernie-5.5-flash-preview:free` reports only `text`.
There is **no single standard field**, but several common shapes.

Conclusion: capability detection must be best-effort and three-valued,
not a boolean.

### What the request can look like

The de-facto standard across OpenAI, Gemini's OpenAI-compatibility endpoint,
Groq, Together, Fireworks, vLLM and OpenRouter is a content array on the user
message:

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What does this screenshot show?" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```

Notes:

- Base64 `data:` URLs work without any publicly reachable image host.
- Gemini accepts the same shape on its OpenAI-compatible endpoint; do **not**
  send Anthropic-style `inlineData` blocks to a `/v1/chat/completions` endpoint.
- `detail` is accepted by OpenAI and ignored by most others; safest to omit.
- Limits vary by provider (Groq: max 3 images, 20 MB request, 2048 tokens per
  image). We should enforce our own conservative cap.
- Sending image parts to a text-only model yields a 400 from the gateway. There
  is no reliable pre-flight probe other than metadata.

## Goals / non-goals

**Goals**

- Paste an image from the clipboard into the composer and send it.
- Keep the existing text-only path byte-for-byte unchanged when no image is
  attached.
- Work on Kilo/OpenRouter today, and degrade gracefully elsewhere.
- Make the confidence in image support visible in the UI, and allow override.

**Non-goals**

- Image generation, image editing, or OCR of scans (separate concerns).
- Sending images to the compile/context tools; they remain text-only.
- Perfect capability detection for arbitrary custom endpoints.

## Proposed design

### 1. Normalized capability detection

Extend `GET /models` parsing in `apps/web/src/lib/ai/models.ts`:

```ts
type ImageSupport = "yes" | "no" | "unknown";
type ModelInfo = {
  id: string;
  label: string;
  imageSupport: ImageSupport;
};
```

Read the first available signal, in order:

1. `architecture.input_modalities` / `input_modalities` /
   `capabilities.input_modalities` / `modalities.input` containing `image`,
   `vision`, or `image_url`;
2. `architecture.modality` containing `image` or `vision`;
3. `type === "vlm"`;
4. `capabilities.vision === true` or `supports_vision === true` / `vision === true`;
5. otherwise `unknown` for custom endpoints, and `no` only when the provider
   catalog explicitly says text-only.

Keep a small static allowlist for OpenAI-style flat IDs that are known to be
vision-capable (`gpt-4o`, `gpt-4.1`, `gpt-5*`, `gemini-*`, `claude-*`), used only
to turn `unknown` into `yes`, never to turn `unknown` into `no`.

Add a user override in Settings → Integrations, stored with the LLM preference:
**Image input: Auto / Force on / Force off**. This is the escape hatch for
custom gateways.

Builder call: detection lives in `models.ts` and is consumed by Settings and the
composer only. The chat route validates and forwards images unconditionally;
it does not re-check capability. **Force off** means the client refuses to
attach or send images (the composer shows why). This avoids two divergent
detection paths and keeps `keys.ts` and the chat zod body unchanged apart from
the `images` field.

### 2. Chat protocol and content assembly

Extend the POST `/api/projects/:id/chat` zod body with:

```ts
images: z.array(z.object({
  id: z.string(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  data: z.string(), // base64 without the data: prefix
})).max(4).optional()
```

Server-side validation also caps decoded bytes per image (1 MB after
normalization) and total payload size. The browser downscales pasted images
with a canvas (longest edge ≤ 1536 px) and re-encodes them as WebP/JPEG before
base64 encoding.

`streamGateway` (`apps/web/src/lib/ai/gateway.ts`) builds the user message as a
content array only when `images.length > 0`; otherwise it keeps the current
string. The model list and capability resolver are not called on every message
by the server: detection is resolved once into a shared client-side helper and
consumed by Settings and the composer. The chat route validates and forwards
images unconditionally; it never re-checks capability.

### 3. Persistence and transcript

Add an `image` variant to `MessagePart` in `packages/shared/src/ai.ts`:

```ts
{ type: "image"; id: string; blobKey: string; name: string; mimeType: string }
```

Before the chat request, write the decoded image to the `uploads` bucket under
`chat/<projectId>/<uuid>.<ext>` and put the blob key in the part. The transcript
renders a thumbnail through a new authenticated, project-scoped route (the
same ownership rule as chat threads: project owner only). The text part keeps a
plain `[image]` marker for copied text and history. This keeps reloads working
without inlining megabytes into the DB.

Builder calls made after review:

- Pasted images are chat attachments, not workspace files — they do not show in
  the file tree and do not affect the compile revision.
- Thumbnails are owner-only, matching thread visibility; the key is scoped by
  project, not by uploading user.
- **Retry without images** reuses the already-persisted user turn and re-sends
  only its text. The original image parts stay in the transcript so the user
  message remains truthful; the retried gateway call omits them.
- Chat attachment blobs are deleted when their thread or project is deleted.
  A cleanup hook belongs alongside the existing chat-store deletion paths.

### 4. UI behaviour

- `onPaste` on the composer textarea intercepts `clipboardData.items` of kind
  `file` whose type starts with `image/`.
- Attached images appear as removable thumbnails above the composer.
- If the selected model reports `no` or `unknown`, show a non-blocking notice:
  “This model may not accept images. You can still try, or switch model.”
- On an image-related 400, show the gateway message and offer “Retry without
  images”. Do not retry automatically.

### 5. Tests

- Unit: capability parsing for all observed metadata shapes; content-array
  assembly; base64/mime/size validation; three-state result.
- Component: paste → thumbnail → remove → send.
- Gateway mock: assert a multimodal request has one text part plus N image
  parts, and that a text-only request still sends a string.
- No real vision provider needed in CI.

## Constraints

- The gateway is always assumed to expose `/v1/chat/completions`; no provider
  SDKs.
- Streaming, tools and thinking must keep working when content is an array.
- Request size must stay within gateway limits; four small images is the cap.
- BYOK keys and server keys take the same code path.

## Follow-up turns: what other products do

Research result (2026-11-22):

- **ChatGPT / Prism.** ChatGPT keeps earlier images in context within the same
  conversation, so "what changed in the second screenshot?" works without
  re-uploading. Images eventually fall out with the context window in very
  long chats. Prism is built on the ChatGPT product surface; its launch post
  explicitly promises turning whiteboard equations/diagrams into LaTeX, and
  OpenAI's community forum has reports about Prism image uploads, so image
  input is part of the product. Our local `zenno/recon` captures do not include
  a multimodal chat transcript, so we cannot verify Prism's exact retention
  window from evidence we hold.
- **Coding harnesses.** Claude Code, Codex CLI, Cursor Agent and OpenCode all
  persist images in the session and resend them to the model on every turn.
  They all had to add caps: OpenCode caps history images at 25 MiB and replaces
  the oldest with a placeholder; Claude Code downscales to ~2000 px, caps
  request size, drops oldest images, and removes them on compaction; Codex
  stores images inline in the session rollout and drops them on local
  compaction. A measured Claude Code study found each image was resent ~130
  times, but cache reads made that a small fraction of total cost.

**Recommendation:** Spektrum should retain images in the thread and include
recent ones in later requests, with an explicit budget rather than unbounded
resending. Concretely:

- images live in message parts, so `recentTurns()` must become multimodal
  instead of returning `{ role, text }` only;
- each request includes at most the **last 4 images** and at most **4 MiB**
  decoded total; older images are replaced in the assembled context by
  `[image omitted — re-attach to discuss]`;
- the text-only path stays unchanged when a thread has no images.

This matches user expectations from ChatGPT/Prism and the harness pattern,
without the runaway request growth those tools had to fix after the fact.

## Open issues for the product owner

1. ~~Should images remain available to the model on later turns in the same
   thread?~~ **Resolved by research (see below): yes, with a bounded window.**
2. Should pasted images also become workspace files? (Proposal: no.)
3. Is four images / 1 MB per image acceptable? (Proposal: yes to start.)
4. Do we want the per-model **Force on/off** override in the first release, or
   ship Auto only and add the override if detection proves flaky?
