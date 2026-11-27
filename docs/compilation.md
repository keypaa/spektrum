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

## Accept, compile and commit

`enqueueProjectCompile` (`apps/web/src/lib/compile-request.ts`):

1. Resolves the project and main file (ownership-scoped).
2. Returns `cached` when the current revision already has a successful render,
   unless the request sets `force: true`.
3. Consumes two Redis token buckets: 6/minute with a burst of 12, and 60/hour.
   A rejection returns HTTP 429 with `Retry-After`.
4. Stores the current revision in Redis and returns `enqueued`. There is **no
   BullMQ job and no permanent worker** on this branch: the compile runs in the
   browser.

`runLocalCompile` (`apps/web/src/lib/compile-client.ts`) then materialises the
documents (blob-backed files are read through the owner-checked download
route), runs the pinned `@siglum/engine@0.2.2` WASM engine in a Web Worker,
uploads the PDF/SyncTeX through signed R2 URLs, and posts only the resulting
keys to `POST /api/projects/:projectId/renders`. That route verifies ownership,
key prefix/kind and actual object sizes before writing the `pdf_renders` row.
A failed compile reports diagnostics and does **not** commit. Engine assets
come from `https://packages.siglum.org` (MIT SDK, TeX Live 2026); nothing AGPL
is vendored. First load is ~30 MB, package coverage is on-demand, and full TeX
Live/BibTeX parity is not guaranteed — see
[Serverless deployment](serverless-deployment.md#9-known-limits).

## Compile states (local events)

There is no server-side render SSE stream on this branch. `useLocalCompile`
(`apps/web/src/lib/render-client.ts`) emits the same `RenderEvent` shapes
locally as the compile advances; the PDF status pill shows:

| State | Meaning |
|---|---|
| `Initializing...` | no render yet |
| `Compiling…` | accepted locally, files loading or WASM running |
| `Compiled` | the latest render for the current revision succeeded |
| `Failed` | the current revision failed to compile |
| `Unsaved changes` | local buffer is dirty |

After a successful commit the client re-reads `/api/projects/:id/render/latest`
for server-only metadata (`isCurrent`, last OK revision). That endpoint uses
`getLatestRender`, which prefers a render whose revision matches the current
documents, so a late error for an older revision cannot stick as **Failed**,
while a direct API compile of the current revision shows its error correctly.

## The viewer

The PDF pane keeps the last successful PDF URL when a compile fails, so you can
still read the previous output while fixing the error. Compile errors appear in
a red banner above the toolbar with a **View log** shortcut. In the tab that
compiled, the PDF is shown from a local object URL; after reload the browser
loads it from the app's own
`/api/projects/:projectId/render/:revision/pdf` route, which checks ownership
and reads the object server-side with `getObject`/`getObjectRange` (ranges make
PDF.js paging work). No signed R2 GET is used for the PDF, so PDF reads do not
depend on bucket CORS. SyncTeX is the exception: the browser obtains a signed
URL from `/api/projects/:projectId/render/:revision/synctex/url` and then reads
the object directly from R2, which does require GET to be allowed by CORS.

- Cursor movement in the editor highlights the matching PDF line (SyncTeX).
- Double-clicking a PDF line jumps back to the source.
- Zoom, page navigation, search (`Cmd/Ctrl+F`), dark mode, and fullscreen live in
  the PDF chrome.
- Text is selectable via a PDF.js text layer.

The refresh arrow forces a compile; the tab strip arrow and `Cmd/Ctrl+S` do the
same through the normal cache-aware path.
