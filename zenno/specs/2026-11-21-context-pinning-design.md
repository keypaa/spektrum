# Spektrum AI context pinning design

Date: 2026-11-21
Status: draft — builder review complete, awaiting human approval

## Intent

Spektrum's assistant should feel like the user's agentic coding harness. Two
interactions are missing:

1. The user can type `@` in the chat composer to pick a file from the workspace
   and pin it to the message.
2. When the user highlights lines in the editor, a chip such as
   `main.tex 55-112` appears in the composer and those exact lines are sent to
   the model as context.

A third, related gap is visible in the user's own report: the assistant can
`list_files` an uploaded PDF but cannot read it, because `read_file` rejects
documents with `blobKey`/`kind: "img"`. The user expects to be able to ask
questions about an assignment brief that was uploaded as a PDF.

Why now: the backend already accepts a `selection` in the chat request and
renders a `<selection>` block in the assembled context (spec §7.4, §12.3;
D89 and D95 deferred the UI). The cost is therefore mostly frontend plus one
new native capability, and it removes a visible "I can't read that" failure.

## Goals

- `@` mentions resolve only to files that exist in the current project.
- A line selection produces a sticky chip that updates in place when the
  selection changes.
- Both pins and the selection travel with the message and are re-read from the
  server's current document content at send time.
- The model can extract text from an uploaded PDF, either directly via a
  pinned `@` mention or on demand via a tool with page ranges.
- Existing chat, review, and fix flows keep working.

## Non-goals

- No general Code Mode / `run_code` migration. With nine tools the context
  savings are marginal, and PDF text extraction is a capability problem rather
  than a tool-count problem. Revisit only if the tool catalog grows materially.
- No changes to the PDF *viewer*, rendering, or annotation UI.
- No persistence of composer chips across page reload. They live for the
  current draft only.
- No `@` mention of chat threads, folders, or non-file entities.
- No PDF writing, annotation, or OCR for scanned/image-only PDFs. Extracted
  text is best-effort; if a page has no text layer the tool says so.

## Anti-goals (what would make this a failure)

- An `@` chip that names a file the current user cannot access, or a selection
  whose path is not validated server-side.
- A chip that silently disappears while the user is still composing.
- Sending stale text — e.g. freezing the highlighted lines at selection time
  so later edits are invisible to the model.
- Blowing the 120k-token context budget by injecting a whole PDF with no cap.

## Constraints and existing state (from recon)

- `Composer` (`apps/web/src/app/(app)/u/[projectId]/composer/composer.tsx`)
  currently renders only the textarea and toolbar; there are no chips and no
  `@` handling. It receives `openTabs: string[]`.
- `openTabs` is misleadingly named: `editor-client.tsx:377` computes it as
  `docs.map((doc) => doc.path)` — **all** workspace documents. It is passed to
  `chat.send()` by the composer, "Review paper", and "Fix with AI".
- `useChat.send(text, thinking, pinnedPaths, displayText?)` posts
  `{ message, thinking, pinnedPaths, threadId? }` to the chat route.
- `chat/route.ts:40-48` **already accepts** `selection?: { path, startLine,
  endLine }` and forwards it to `buildContext`, which renders
  `<selection path="…" lines="…">` (currently with no per-line numbers).
- `buildContext` loads only `mainFile`, pinned paths, touched paths, and
  `refs.bib`; blob documents come back with `content: null`.
- `MonacoEditor` exposes `onCursorChange` and imperative `revealLine`, but has
  **no selection event or selection getter**. It must gain one.
- `QuickFileSearch`
  (`apps/web/src/app/(app)/u/[projectId]/editor/quick-file-search.tsx`) is a
  reusable, filterable document list; it is a full-screen modal, so it is not
  suitable as an inline `@` dropdown without refactor.
- Uploaded PDFs are stored as S3 objects in the `uploads` bucket under
  `${projectId}/${path}` and referenced by `documents.blobKey`. `getObject()`
  in `@spektrum/storage` fetches them. `pdfjs-dist` is already a dependency of
  `apps/web` and `apps/worker`, and the worker already imports
  `pdfjs-dist/legacy/build/pdf.mjs` in Node code (`apps/worker/src/compile.ts`).
- `kindForPath("x.pdf") === "img"`, so `read_file` rejects PDFs as binary.
- The spec's deferred items D88/D89/D95 cover exactly these features; this
  design supersedes those deferrals.

## Decisions (these are the designer's calls, not user-approved choices)

1. **Pinned paths become explicit.** The composer's `pinnedPaths` argument is
   the list of `@` chips, not every workspace document. Rationale: if every
   file is always pinned, `@` adds no signal and the context gets noisier. The
   model still discovers files through `list_files` and reads them through
   `read_file`. "Review paper" and "Fix with AI" keep passing the full document
   list explicitly, preserving today's whole-project behavior.
2. **One authority for the selection chip.** `editor-client.tsx` owns the
   `selection` state; `Composer` never stores a second copy. The composer
   renders chips derived from `pinnedPaths` (its own local ordered array) plus
   the `selection` prop, with the selection chip always last. A new selection
   replaces the existing one in the parent state in place; an empty selection
   event from Monaco is ignored, so the chip is sticky. Removing the selection
   chip (× or backspace) calls `onClearSelection()`, which resets the parent
   state — otherwise a later re-render would resurrect a chip the user deleted.
   Backspace with an empty textarea removes the selection chip first, then
   pops the last pinned file.
3. **Chips clear on send and on manual deletion only.** `submit()` calls
   `onClearSelection()` and empties `pinnedPaths`; each chip also has an
   explicit × button. No chip survives a sent message.
4. **Selection content is re-read at send time.** The client sends only the
   path and line range. The server slices the current stored document, so
   edits made after highlighting are reflected. Because autosave is debounced
   (400 ms), `Composer` gains an optional `beforeSend?: () => Promise<void>`
   prop; `editor-client` supplies `autosave.flush()`, and `submit()` awaits it
   before calling `chat.send()`. Without this the server could slice stale
   content inside the debounce window. A chip click reveals and re-selects the
   range in Monaco without changing the sent range.
5. **Line numbers are added to the injected selection.** `<selection>` body
   becomes `55| …text…`, `56| …`, etc., so the model can quote exact lines.
6. **Pinned PDFs are injected, not merely named.** When a pinned path resolves
   to a PDF, `buildContext` extracts its text and adds a `<pdf path="…"
   pages="…">` section with page markers, capped per document. This fulfils
   the spec's deferred "retrieved text from user-provided files". A `read_pdf`
   tool remains available for follow-up page ranges and for PDFs the user did
   not pin.
7. **Cap and cache extraction.** Per-PDF injection cap 12,000 characters;
   tool cap 30,000 characters; in-memory cache keyed by blob key with 20
   entries / 10-minute TTL. PDF sections are droppable before the main file is
   truncated (`DropKey` gains `"pdfs"`).
8. **No Code Mode migration.** Add one native tool, keep the other nine.

## Detailed design

### A. Monaco selection events

- Add to `MonacoEditorProps`:
  `onSelectionChange?(range: { startLine: number; endLine: number } | null): void`.
- Subscribe with `editor.onDidChangeSelection(...)`. On a non-empty selection,
  report 1-based, inclusive start/end line numbers from the primary selection;
  on an empty selection report `null`.
- Add to `MonacoEditorHandle`: `revealRange(startLine, endLine): void` which
  calls `revealLineInCenter(startLine)` and `setSelection` over the full range.
- Update the Monaco test mock to implement both hooks.
- `editor-client.tsx` owns `selection` state as
  `{ path: string; startLine: number; endLine: number } | null`. The Monaco
  callback sets it using the current `activePath`; a `null` event does **not**
  clear it. Pass the value plus a clear callback into `Composer`.

### B. Composer UI and `@` mentions

- New props: `selection`, `onClearSelection`, `onNavigateToSelection`,
  `beforeSend?: () => Promise<void>`, and `documents: DocumentSummary[]`
  (the `@` candidate list). The composer derives its rendered chip list from
  the `selection` prop plus its own `pinnedPaths` array; it never copies the
  selection into local state.
- Render a wrapping chip row inside the composer box, above the textarea:
  - file chip: file icon + path + ×
  - selection chip: path + `startLine-endLine` + ×; clicking the label calls
    `onNavigateToSelection`.
- `@` detection: on `onChange`, examine the text before the caret with
  `/(?:^|\s)@([^\s@]*)$/` — the wider query class matters because uploaded
  names can contain spaces and parentheses, e.g. `pdf (1).pdf`. A match opens
  an anchored dropdown listing
  `documents` whose path contains the query (cap 50). ArrowUp/ArrowDown move a
  highlighted option, Enter selects, Escape closes. Selecting removes the
  `@query` token from the textarea text, appends a file chip (deduped), closes
  the dropdown, and refocuses the textarea.
- `onKeyDown`: Escape closes the dropdown; Backspace with an empty textarea
  removes the last chip; Enter (without Shift) submits when the dropdown is
  closed.
- `submit()` awaits `beforeSend?.()`, captures the current `selection` value,
  calls `chat.send(text, level, pinnedPaths, undefined, capturedSelection)`,
  and only **then** clears the text and chips including `onClearSelection()`.
  The order matters: React state updates are asynchronous, so clearing first
  and reading the prop afterwards could send a stale value.
- Tests: `@` opens/filters/selects; chip removal by × and backspace (including
  that removing the selection chip calls `onClearSelection` and that the chip
  does not reappear on a prop re-render); selection chip replaces in place and
  survives empty selection events; send awaits the flush, clears chips, and
  passes the new arguments.

### C. `useChat` request shape

- Extend `send(text, thinking, pinnedPaths, displayText?, selection?)`.
- Store `selection` in `lastSend` so `retry()` and `rerun()` resend it.
- Include `selection` in the POST body when present.
- Test the exact body in `use-chat.test.ts`.

### D. Context assembly changes (`lib/ai/context.ts`)

- Add `selection?.path` to `contentPaths` when a selection is present;
  without it `byPath.get(selection.path)` is undefined and the selection body
  silently comes back empty.
- `selectionBody`: number each line as `${startLine + i}| ${line}`.
- Add `"pdfs"` to `DropKey` and to the drop order after `"touched"`. The
  existing budget loop removes one section per key, so with several pinned
  PDFs only the first is dropped by that loop; the rest are handled by the
  existing main-file truncation. Do not refactor the budget loop in this
  feature.
- For pinned paths whose document is a PDF (`path.toLowerCase().endsWith(".pdf")`
  and `content === null` / `blobKey` present), call the extraction helper and
  add a `<pdf path="…" pages="…">` section capped at 12,000 characters,
  marked `dropKey: "pdfs"`. If extraction fails, emit a one-line note rather
  than throwing.
- Update the manifest line for such documents to show `pdf, N pages` when
  extraction succeeded, otherwise `pdf`. `listContextDocuments` exposes
  `blobKey` but not a byte size, so the page count comes from the extraction
  result.
- Keep the existing budget and truncation behavior for the main file.
- Tests: numbered selection lines, PDF section injection, PDF section dropped
  under a tight budget, extraction failure degrades gracefully.

### E. PDF extraction helper and tool

- New `apps/web/src/lib/ai/pdf-text.ts`:
  `extractPdfText(userId, projectId, path, pages?: [number, number]):
  Promise<{ text: string; pages: number; truncated: boolean }>`.
  - Resolve the document with an owner-scoped lookup that includes `blobKey`.
    Extend `getDocumentByPath` to select `blobKey` (additive, safe).
  - For text documents, return the content split into lines.
  - For blobs, `getObject("uploads", doc.blobKey)`, dynamic-import
    `pdfjs-dist/legacy/build/pdf.mjs`, iterate pages and `getTextContent()`,
    join text items with spaces, prefix each page with `\n--- page N ---\n`.
  - Restrict page ranges to `1..numPages`; cap output at 30,000 characters and
    append `[truncated — use read_pdf(path, pages) for more]`. If a page has no
    text layer, emit `[page N: no extractable text]` for it instead of silently
    returning an empty section.
  - Cache by blob key (20 entries, 10-minute TTL).
  - Reject non-PDF paths and documents the user cannot access.
- New tool `read_pdf` with `{ path: string, pages?: [number, number] }`:
  - register in `packages/shared/src/ai/tools.ts`, add to `ToolName` in
    `packages/shared/src/ai.ts`, add parser to `toolArgs`;
  - execute in `apps/web/src/lib/ai/tools.ts` by calling the helper, adding the
    path to `ctx.touchedPaths`, and returning the text.
- Tests: extraction with two pages, page range, truncation, cache hit, missing
  document, non-PDF path; tool executor returns text and touches the path;
  shared tool-name test updated to ten tools.

### F. Server validation

- Tighten `chat/route.ts:45-47`: require `startLine` and `endLine` to be
  positive integers and `endLine >= startLine`. Today any integer is accepted,
  which produces an empty selection body for nonsense ranges and makes bad
  client data hard to diagnose.
- The chat route already scopes `buildContext` by `userId`/`projectId`, which
  validates the selection path indirectly (a path not in the project yields an
  empty selection body). Keep that property; do not trust a client-supplied
  path to fetch arbitrary data.
- `extractPdfText` must use the same owner-scoped lookup, never a raw blob key
  supplied by the client.

### G. Tests and CI

- Extend unit tests named in recon (composer, monaco-editor, use-chat,
  context, chat route, tools, pdf-text, documents).
- Update `e2e/ai-gateway.ts` so any new prompt text/chips still routes to the
  intended mock branch. Add an e2e case covering `@` pin and a selection chip,
  asserting on data in two places: intercept the browser's POST to
  `/api/projects/*/chat` to verify `pinnedPaths`/`selection`, and read the mock
  gateway's `/requests` log to verify the assembled system prompt contains
  `<selection … lines="55-112">` with numbered lines. Do not assert on pixels.
- No visual baselines: the visual CI job has been removed.

## Left to the builder

- Exact component split for the mention dropdown (inline subcomponent vs. a
  new reusable `MentionMenu`), as long as keyboard behavior matches §B.
- Whether the chip row is inside the composer border or immediately above it;
  keep it visually attached to the composer either way.
- CSS details, icon choices, and animation timing, following existing tokens.
- Whether to expose `getSelection()` on the Monaco handle in addition to
  `onSelectionChange`; either is acceptable if the chip updates correctly.
