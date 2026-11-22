# Compilation and the PDF preview

## Revisions

A project’s revision is `revisionHash`: sha256 over `path || sha256(content ?? blobKey)` for every document, sorted by path (`packages/shared/src/revision.ts`). Any save changes it, including a blob replacement.

## What triggers a compile

- On project open, if the persisted render is not for the current revision.
- After an autosave when **Realtime compilation** is on (Preferences → Editor).
- `Cmd/Ctrl+S` (save then compile).
- The PDF toolbar’s refresh arrow. This **forces** a fresh compile even when the
  current revision already has an OK render, bypassing the cache short-circuit.
- The AI `compile` tool, used by prompts like *Review paper* and fix flows.

## Enqueue and limits

`enqueueProjectCompile` (`apps/web/src/lib/compile-request.ts`):

1. Resolves the project and main file (ownership-scoped).
2. Returns `cached` when the current revision already has a successful render,
   unless the request sets `force: true`.
3. Consumes two Redis token buckets: 6/minute with a burst of 12, and 60/hour.
   A rejection returns HTTP 429 with `Retry-After`.
4. Stores the current revision in Redis and enqueues one BullMQ job.

The worker materialises the documents, rechecks the revision, runs `pdflatex`
(or the `% !TEX program` override) in a throwaway TeX Live container, parses the
log and SyncTeX data, stores PDF/SyncTeX in S3, and publishes SSE events.

## Streaming states

`useRenderStream` subscribes to `/api/projects/:projectId/render/stream` and
handles `status`, `log`, `result`, and `conflict` events. The PDF status pill
shows:

| State | Meaning |
|---|---|
| `Initializing...` | no render yet |
| `Compiling…` | queued, running, or superseded |
| `Compiled` | the latest render for the current revision succeeded |
| `Failed` | the current revision failed to compile |
| `Unsaved changes` | local buffer is dirty |

On every SSE event the client re-reads `/api/projects/:id/render/latest`. That
endpoint uses `getLatestRender`, which prefers a render whose revision matches
the current documents. A late error for an older revision therefore cannot
stick as **Failed**, while a direct API compile of the current revision does
show its error correctly.

## The viewer

The PDF pane keeps the last successful PDF URL when a compile fails, so you can
still read the previous output while fixing the error. Compile errors appear in
a red banner above the toolbar with a **View log** shortcut.

- Cursor movement in the editor highlights the matching PDF line (SyncTeX).
- Double-clicking a PDF line jumps back to the source.
- Zoom, page navigation, search (`Cmd/Ctrl+F`), dark mode, and fullscreen live in
  the PDF chrome.
- Text is selectable via a PDF.js text layer.

The refresh arrow forces a compile; the tab strip arrow and `Cmd/Ctrl+S` do the
same through the normal cache-aware path.
