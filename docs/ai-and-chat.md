# AI providers and chat

## Provider setup

Spektrum talks to any OpenAI-compatible `/chat/completions` endpoint. The
catalog lives in `packages/shared/src/ai/providers.ts` and includes Kilo Code,
OpenRouter, OpenAI, DeepSeek, Groq, Mistral, Together, Fireworks, xAI, Gemini,
Qwen, and a **Custom endpoint** entry. The catalog only supplies defaults: in
**Settings → Integrations** you can change the provider, the base URL, and both
model names.

- **Server key:** `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL_CHAT` /
  `LLM_MODEL_FAST` in `.env` provide a workspace-wide default.
- **BYOK key:** a user can paste a personal key into **LLM API key** in Settings.
  It is stored encrypted in `users.llm_api_key_ciphertext` using
  `LLM_KEY_ENCRYPTION_SECRET`. The API never returns the key — only a masked
  suffix — so the field shows **Replace key** once configured. On the free
  serverless deployment members must add their own key; the optional server key
  remains owner-only. See
  [`serverless-deployment.md`](serverless-deployment.md#6-public-signup-and-byok-onboarding).
- Base URLs are validated before a Bearer token is sent: remote endpoints must
  be HTTPS; plain HTTP is allowed only for `localhost`/loopback model servers.

A free-tier model such as `baidu/ernie-5.5-flash-preview:free` on Kilo Code
shares an upstream quota. An upstream rate limit is relayed verbatim from the
gateway; switch to a paid model or add your own provider key for your own
limits.

## The chat panel

The chat floats over the editor at the bottom of the centre column. Its header
contains, left to right:

- **New chat** (speech-bubble-plus icon) — clears the conversation and returns
  to the empty state.
- **Close chat** (×) — hides the panel. The tab strip’s chat button reopens it;
  if it is already open, that button starts a new chat instead.
- **Pop out chat** (arrow) — moves the panel into the right column, replacing the
  PDF pane, and flips to a left-pointing **Dock chat** arrow. The collapsed
  control is intentionally unavailable while popped out.
- A centred pill handle on top resizes the docked panel by dragging. The panel
  is translucent with a blurred backdrop, so editor text shows faintly behind.

The composer supports:

- **Thinking level** — Minimal → Extra high; maps to reasoning effort and max
  output tokens.
- **@ mentions** — typing `@` opens a file picker; choosing a file inserts
  `@path`. Mentioned and pinned files are shown as pills above the sent user
  message so the context is visible after the fact.
- **Selection chips** — a highlighted editor range can be attached to a
  follow-up.
- **Upload** (+) — adds files to the workspace before sending.
- **Images** — paste a screenshot into the composer with Ctrl/Cmd+V. A thumbnail
  appears above the text box (with a remove button); the image is sent with the
  message on Enter. Pasted images are chat attachments, **not** workspace files:
  they never enter the file tree or a compile revision, and the owner-only
  thumbnail follows the same thread visibility as the conversation.

### Image input: capability, limits, and retry

For the complete data flow, storage model, file map and troubleshooting, see
[Image input in the AI chat](image-chat-input.md).

**Capability.** Support is detected per model from the same `/models` payload
Settings uses (input modalities, architecture/vision flags, or a known vision
model id). **Settings → Integrations → Image input** overrides detection:
**Auto** never blocks an attachment — it only shows a non-blocking notice when
the model looks text-only or the signal is unknown — while **Force on** and
**Force off** trust the operator and override detection in both directions.

**Limits.** The browser downscales each image so its longest edge is at most
1536 px, then re-encodes it (WebP, falling back to JPEG) and uploads the bytes
directly to R2 with a short-lived signed PUT. Allowed source types are PNG,
JPEG, WebP, and GIF. The server enforces at most **4 images per request**,
**1 MiB decoded per image**, and a **4 MiB total decoded history budget**. When
those caps are exceeded the oldest images are dropped first; the request then
carries the marker `[image omitted — re-attach to discuss]`. A request body
declaring more than 8 MiB is rejected with HTTP 413 before it is parsed (on
Vercel the platform's 4.5 MB cap applies first).

**Wire format.** The browser sends only signed keys
(`u/<userId>/chat-image/…`), never inline bytes: the route verifies the prefix
and kind and re-reads each object before persisting it. Toward the gateway the
images become OpenAI-compatible `image_url` parts whose URL is
`data:<mime>;base64,...`. No `detail` field is sent. Text-only messages keep
`content` as a plain string, byte-for-byte as before. Recent history carries
the newest images into follow-ups within the same budget; **New chat** starts a
fresh thread, so the next message is text-only again.

**Retry.** If the gateway rejects an image request (HTTP 400 with an image
mention in the error), the composer shows a **Retry without images** button. It
reuses the failed turn's already-persisted row (no duplicate bubble) and
re-sends its text without the images. From then on every later message in the
same thread omits history images, so a plain follow-up cannot be poisoned by
the rejected attachment; the original images stay stored and visible in the
transcript. **New chat** clears this state.

## Streaming and tools

The route streams SSE events: `meta`, `thinking`, `text`, `tool_call`,
`tool_result`, `diff`, `title`, `done`, and `error`. The transcript renders them
in order:

- thinking is a collapsed block;
- assistant text is markdown with KaTeX and a copy button;
- tool calls are short rows such as `read_pdf` or `edit_file`;
- diff proposals become cards with **Reject**, **Accept**, and **Accept all**.

Tools available to the model: `list_files`, `read_file`, `write_file`,
`edit_file`, `create_file`, `delete_file`, `read_pdf`, `compile`, `get_logs`, and
`search_project`. Edits never write directly: they produce a diff card that the
user must accept.

Consecutive identical tool calls/results are collapsed in the transcript. If
you see one `edit_file` row followed by `oldText occurs 0 times`, the model
retried the same edit several times; the UI is showing the attempt once, not
hiding the failure.

## Rate limits

`BUDGETS.ai` is 30 requests per minute per user. AI requests also carry the
resolved system prompt, the project manifest, pinned documents and recent
history within a token budget. See
[`zenno/specs/2026-11-07-spektrum-design.md`](../zenno/specs/2026-11-07-spektrum-design.md)
§12 for the prompt and context assembly rules.
