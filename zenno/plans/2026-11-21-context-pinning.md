# AI Context Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Spektrum's assistant receive explicitly pinned files and a highlighted line range from the editor, and let it read text out of uploaded PDFs.

**Architecture:** The frontend gains an `@` mention picker and a sticky selection chip; both are sent as `pinnedPaths` and `selection` in the existing chat request. The server already accepts `selection`, so the work there is validation plus richer rendering in `buildContext`. PDF text is extracted server-side with `pdfjs-dist` (already proven in the worker), exposed as one new native tool and injected for pinned PDFs.

**Tech Stack:** Next.js 16 App Router, React 19, Monaco, pdfjs-dist 6.5.438, Zod, Vitest, Playwright.

**Spec:** `zenno/specs/2026-11-21-context-pinning-design.md`

## Global Constraints

- Node 26.13.0, pnpm 12.18.0, engine-strict. Use `pnpm`, never npm/yarn.
- The chat request body schema is the contract between client and server; both sides must agree on `selection: { path, startLine, endLine }` and `pinnedPaths: string[]`.
- Line numbers are 1-based and inclusive throughout, including the `lines="a-b"` attribute.
- `getObject`, `getDocumentByPath` and `buildContext` are server-only and must stay owner-scoped.
- TDD: write the failing test, watch it fail, implement minimally, watch it pass, commit.
- Never commit secrets. The full suite (`pnpm test && pnpm lint && pnpm typecheck && pnpm build`) must be green before the final push.

## Review Focus

These are the inputs most likely to break in normal use. Each gets a test in the task that owns the code.

1. **Monaco emits an empty selection when the user just clicks** — the chip must stay, not vanish. Test in Task 5 and Task 6.
2. **User deletes the selection chip, then the parent re-renders** — the chip must not come back. Test in Task 6.
3. **User edits highlighted lines and sends inside the 400 ms autosave window** — the model must see the edited lines. Test in Task 7.
4. **Nonsense selection ranges from a bad client** (negative, reversed) — the route must reject them, not slice garbage. Test in Task 4.
5. **Scanned or empty PDF page** — extraction must report "no extractable text", not an empty section. Test in Task 1.

---

### Task 1: PDF text extraction helper

**Files:**
- Create: `apps/web/src/lib/ai/pdf-text.ts`
- Create: `apps/web/src/lib/ai/pdf-text.test.ts`
- Modify: `apps/web/src/lib/documents.ts` (`getDocumentByPath`, ~lines 214-235)
- Fixture: reuse `e2e/visual/fixtures/example.pdf` (real PDF with a text layer)

**Interfaces:**
- Consumes: `getObject("uploads", blobKey)` from `@spektrum/storage`; `getDocumentByPath(ownerId, projectId, path)` returning `DocumentRecord` with `blobKey`.
- Produces: `extractPdfText(userId: string, projectId: string, path: string, pages?: [number, number]): Promise<{ text: string; pages: number; truncated: boolean }>`.

- [ ] **Step 1: Extend `getDocumentByPath` to select `blobKey`**

Add `blobKey: documents.blobKey` to the select and include it in the returned record. `DocumentRecord.blobKey?: string | null` already exists. Existing tests only assert `.id` or null.

- [ ] **Step 2: Write failing tests in `pdf-text.test.ts`**

Cover, using a mocked `getObject` returning the fixture bytes and a mocked owner-scoped document lookup:
- two-page extraction contains `--- page 1 ---` and `--- page 2 ---` plus text from the fixture;
- `pages = [2,2]` returns only page 2 and `pages === 1`;
- output over 30,000 characters ends with `[truncated — use read_pdf(path, pages) for more]`;
- a second identical call hits the cache (one `getObject` call);
- a document with no blob and no content, a non-`.pdf` path, and a document owned by another user all reject;
- a page whose `getTextContent()` returns no items produces `[page N: no extractable text]`.

Use `vi.mock("@spektrum/storage")` and `vi.mock` the pdfjs module; assert on the helper's return values, not on mock internals.

- [ ] **Step 3: Run the tests; confirm they fail because the module does not exist**

Run: `pnpm vitest run apps/web/src/lib/ai/pdf-text.test.ts`

- [ ] **Step 4: Implement `extractPdfText`**

Dynamic-import `pdfjs-dist/legacy/build/pdf.mjs` exactly as `apps/worker/src/compile.ts:42` does, call `getDocument({ data: new Uint8Array(bytes) })`, iterate `doc.numPages`, join `getTextContent()` items' `str` fields with spaces, and call `doc.cleanup()` in `finally`. Clamp page ranges to `1..numPages`; cap at 30,000 characters. Cache by blob key in a module-level `Map` with 20 entries and 10-minute TTL. For inline text documents, return their content with `pages: 1`.

- [ ] **Step 5: Run tests until green; run `pnpm typecheck`**

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ai/pdf-text.ts apps/web/src/lib/ai/pdf-text.test.ts apps/web/src/lib/documents.ts
git commit -m "feat(ai): extract text from uploaded PDFs"
```

---

### Task 2: `read_pdf` tool

**Files:**
- Modify: `packages/shared/src/ai/tools.ts` (schema, `toolSchemas`, `toolArgs`)
- Modify: `packages/shared/src/ai.ts` (`ToolName`)
- Modify: `apps/web/src/lib/ai/tools.ts` (executor switch)
- Modify: `packages/shared/src/ai/tools.test.ts`
- Modify: `apps/web/src/lib/ai/tools.test.ts`

**Interfaces:**
- Consumes: `extractPdfText` from Task 1.
- Produces: tool name `"read_pdf"`, Zod schema `readPdf = { path: string, pages?: [number, number] }`, and executor case.

- [ ] **Step 1: Write failing tests**

In `packages/shared/src/ai/tools.test.ts`, update the tool-name list from nine to ten and assert `read_pdf` exists with `function.name === "read_pdf"` and a `pages` property in its JSON schema. In `apps/web/src/lib/ai/tools.test.ts`, assert `executeTool("read_pdf", { path: "brief.pdf" })` calls the extractor and returns its text, and that the path is added to `ctx.touchedPaths`.

- [ ] **Step 2: Run tests; confirm they fail**

Run: `pnpm vitest run packages/shared/src/ai/tools.test.ts apps/web/src/lib/ai/tools.test.ts`

- [ ] **Step 3: Register the tool**

Add `readPdf` Zod object, a `tool("read_pdf", "Extract text from a PDF, optionally a page range.", readPdf)` entry in `toolSchemas()`, and `read_pdf: readPdf` in `toolArgs`. Add `"read_pdf"` to `ToolName` in `ai.ts`. Add a `case "read_pdf"` in `apps/web/src/lib/ai/tools.ts` that parses args through `toolArgs`, calls `extractPdfText(ctx.userId, ctx.projectId, path, pages)`, adds the path to `ctx.touchedPaths`, and returns `{ ok: true, summary: \`read \${path}\`, data: text }`.

- [ ] **Step 4: Run tests until green; run `pnpm typecheck`**

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ai/tools.ts packages/shared/src/ai.ts packages/shared/src/ai/tools.test.ts apps/web/src/lib/ai/tools.ts apps/web/src/lib/ai/tools.test.ts
git commit -m "feat(ai): add read_pdf tool"
```

---

### Task 3: Selection and PDF context sections

**Files:**
- Modify: `apps/web/src/lib/ai/context.ts` (`DropKey`, `contentPaths`, `selectionBody`, sections, manifest)
- Modify: `apps/web/src/lib/ai/context.test.ts`

**Interfaces:**
- Consumes: `extractPdfText` from Task 1.
- Produces: context text containing `<selection path="…" lines="a-b">` with numbered lines and `<pdf path="…" pages="…">` for pinned PDFs; `dropped` may contain `"pdfs"`.

- [ ] **Step 1: Write failing tests in `context.test.ts`**

Assert: a selection on lines 2-3 of `a.tex` produces body lines beginning `2| ` and `3| `; the selection path is included even when it is not main/pinned; a pinned `brief.pdf` with a blob produces a `<pdf>` section with `--- page 1 ---`; when `extractPdfText` rejects, a one-line note appears and `buildContext` does not throw; with a tight `limit`, a `pdfs` entry appears in `dropped`; the manifest shows `pdf, N pages` for a successfully extracted PDF.

- [ ] **Step 2: Run tests; confirm they fail**

Run: `pnpm vitest run apps/web/src/lib/ai/context.test.ts`

- [ ] **Step 3: Implement**

Add `selection?.path` to `contentPaths`. Number selection lines as `${selection.startLine + i}| ${line}`. Extend `DropKey` to `"pdfs"` and drop order to `["history", "bib", "touched", "pdfs"]`. For pinned paths whose doc has `blobKey` and a `.pdf` extension, call `extractPdfText`, cap at 12,000 characters, emit a Section with key `pdf`, `attrs: \`path="${path}" pages="${pages}"\``, `dropKey: "pdfs"`, and catch failures into a one-line note. Update the manifest branch for those docs.

- [ ] **Step 4: Run tests until green; run `pnpm typecheck`**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ai/context.ts apps/web/src/lib/ai/context.test.ts
git commit -m "feat(ai): inject numbered selections and pinned PDFs into context"
```

---

### Task 4: Selection in the chat request and route validation

**Files:**
- Modify: `apps/web/src/app/(app)/u/[projectId]/composer/use-chat.ts` (`send`, `lastSend`, POST body)
- Modify: `apps/web/src/app/(app)/u/[projectId]/composer/use-chat.test.ts`
- Modify: `apps/web/src/app/api/projects/[projectId]/chat/route.ts` (`bodySchema`)
- Modify: `apps/web/src/app/api/projects/[projectId]/chat/route.test.ts`

**Interfaces:**
- Consumes: nothing new (extends existing send signature).
- Produces: `send(text, thinking, pinnedPaths, displayText?, selection?)`, with `selection` of type `{ path: string; startLine: number; endLine: number } | undefined`.

- [ ] **Step 1: Write failing tests**

In `use-chat.test.ts` (extend with a `fetch` mock if needed), assert the POST body contains `selection` when supplied and omits it otherwise, and that `retry()`/`rerun()` resend it. In `chat/route.test.ts`, assert a request with `startLine: -1`, `endLine: 0`, or `endLine < startLine` returns 400, and that a valid `selection` is forwarded to both `buildContext` calls.

- [ ] **Step 2: Run tests; confirm they fail**

Run: `pnpm vitest run apps/web/src/app/\(app\)/u/\[projectId\]/composer/use-chat.test.ts 'apps/web/src/app/api/projects/[projectId]/chat/route.test.ts'`

- [ ] **Step 3: Implement**

Add the fifth parameter to `send` and to the `lastSend` ref; include `selection` in `JSON.stringify` only when defined. In `bodySchema`, require `.int().min(1)` on both line numbers and use `.refine` for `endLine >= startLine`; route the 400 through the existing bad-request response.

- [ ] **Step 4: Run tests until green; run `pnpm typecheck`**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/u/\[projectId\]/composer/use-chat.ts apps/web/src/app/\(app\)/u/\[projectId\]/composer/use-chat.test.ts 'apps/web/src/app/api/projects/[projectId]/chat/route.ts' 'apps/web/src/app/api/projects/[projectId]/chat/route.test.ts'
git commit -m "feat(ai): send and validate line-selection context"
```

---

### Task 5: Monaco selection events

**Files:**
- Modify: `apps/web/src/editor/monaco-editor.tsx`
- Modify: `apps/web/src/editor/monaco-editor.test.tsx`

**Interfaces:**
- Consumes: Monaco `editor.onDidChangeSelection`.
- Produces: prop `onSelectionChange?(range: { startLine: number; endLine: number } | null): void`; handle method `revealRange(startLine: number, endLine: number): void`.

- [ ] **Step 1: Write failing tests in `monaco-editor.test.tsx`**

Extend the mock editor with `onDidChangeSelection`. Assert: a non-empty selection reports 1-based inclusive line numbers; an empty selection reports `null`; `revealRange(55, 112)` calls `revealLineInCenter(55)` and `setSelection` with the full range.

- [ ] **Step 2: Run tests; confirm they fail**

Run: `pnpm vitest run apps/web/src/editor/monaco-editor.test.tsx`

- [ ] **Step 3: Implement**

Add the prop and subscribe in the existing mount effect with a ref for the latest callback (matching `onCursorChange`). Compute lines from `editor.getModel()?.getPositionAt(selection.getStartPosition())` and the end position. Add `revealRange` to `useImperativeHandle`.

- [ ] **Step 4: Run tests until green; run `pnpm typecheck`**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/editor/monaco-editor.tsx apps/web/src/editor/monaco-editor.test.tsx
git commit -m "feat(editor): expose Monaco selection changes"
```

---

### Task 6: Composer chips and `@` mentions

**Files:**
- Modify: `apps/web/src/app/(app)/u/[projectId]/composer/composer.tsx`
- Modify: `apps/web/src/app/(app)/u/[projectId]/composer/composer.test.tsx`

**Interfaces:**
- Consumes: `selection: { path, startLine, endLine } | null`, `onClearSelection()`, `onNavigateToSelection(range)`, `beforeSend?: () => Promise<void>`, `documents: DocumentSummary[]`.
- Produces: a chip row and an `@` dropdown; `submit()` calls `chat.send(text, level, pinnedPaths, undefined, capturedSelection)` then clears everything.

- [ ] **Step 1: Write failing tests in `composer.test.tsx`**

Cover: typing `@mai` opens a dropdown filtered to matching paths; selecting a path inserts a file chip and removes the `@mai` token; a selection prop renders `path 55-112`; a new selection prop replaces the existing chip without adding a second; an empty selection (`null`) leaves the chip; clicking × or Backspace on an empty textarea calls `onClearSelection`; a re-render with the same `selection` prop after deletion does not resurrect the chip; Enter awaits `beforeSend` before calling `chat.send` and clears all chips after; `chat.send` receives the captured selection, not a cleared one.

- [ ] **Step 2: Run tests; confirm they fail**

Run: `pnpm vitest run apps/web/src/app/\(app\)/u/\[projectId\]/composer/composer.test.tsx`

- [ ] **Step 3: Implement**

Keep only `pinnedPaths` in local state; derive the rendered chip list from it plus the `selection` prop, with selection last. Detect `@` with `/(?:^|\s)@([^\s@]*)$/` on text before the caret. Render an anchored dropdown with Arrow/Enter/Escape handling. Make `submit` async, awaiting `beforeSend?.()` and capturing `selection` before clearing. Leave the `disabled` rule unchanged: a chip-only message with no text stays disabled, matching current behavior.

- [ ] **Step 4: Run tests until green; run `pnpm typecheck`**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/u/\[projectId\]/composer/composer.tsx apps/web/src/app/\(app\)/u/\[projectId\]/composer/composer.test.tsx
git commit -m "feat(chat): add @ file mentions and selection chips"
```

---

### Task 7: Wire the editor shell

**Files:**
- Modify: `apps/web/src/app/(app)/u/[projectId]/editor-client.tsx`
- Modify: `apps/web/src/app/(app)/u/[projectId]/editor-client.test.tsx`

**Interfaces:**
- Consumes: all of Tasks 1-6.
- Produces: `selection` state and callbacks passed to `Composer`; `beforeSend = () => autosave.flush()`.

- [ ] **Step 1: Write failing tests in `editor-client.test.tsx`**

With Monaco mocked to emit a selection, assert the composer receives `selection` with the active path; firing `onSelectionChange(null)` keeps it; the clear callback resets it; clicking a selection chip calls `revealRange`; and `beforeSend` calls the mocked `autosave.flush()`.

- [ ] **Step 2: Run tests; confirm they fail**

Run: `pnpm vitest run apps/web/src/app/\(app\)/u/\[projectId\]/editor-client.test.tsx`

- [ ] **Step 3: Implement**

Add `selection` state; set it from Monaco's `onSelectionChange` using the current `activePath`, ignoring `null`. Pass `onSelectionChange`, `revealRange`, `documents={docs}`, `selection`, `onClearSelection`, `onNavigateToSelection`, and `beforeSend={() => autosave.flush()}` into `Composer`. Keep `onReview`/`onFix` passing the full `docs.map(d => d.path)` list as before.

- [ ] **Step 4: Run tests until green; run `pnpm test && pnpm lint && pnpm typecheck && pnpm build`**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/u/\[projectId\]/editor-client.tsx apps/web/src/app/\(app\)/u/\[projectId\]/editor-client.test.tsx
git commit -m "feat(editor): connect selection chips to the chat composer"
```

---

### Task 8: E2E coverage for pinned context

**Files:**
- Modify: `e2e/ai-gateway.ts`
- Modify: `e2e/ai.spec.ts`

**Interfaces:**
- Consumes: the new request body fields from Task 4 and context sections from Task 3.

- [ ] **Step 1: Write a failing e2e case**

Add a spec that highlights lines in Monaco, types an `@` mention, sends a message, and asserts: the intercepted POST to `/api/projects/*/chat` contains the expected `pinnedPaths` and `selection`; the mock gateway's recorded system prompt contains `<selection … lines="…">` with a numbered line and `<pdf …>` when a PDF is pinned. Add any new branch needed to `e2e/ai-gateway.ts` so the prompt still reaches the intended mock response.

- [ ] **Step 2: Run it; confirm it fails**

Run: `DATABASE_URL=postgres://spektrum:spektrum@localhost:5432/spektrum_test REDIS_URL=redis://localhost:6379 pnpm exec playwright test --config=playwright.ai.config.ts -g "context"`

- [ ] **Step 3: Implement the gateway branch and any selectors needed**

- [ ] **Step 4: Run the full AI suite until green**

Run: `pnpm exec playwright test --config=playwright.ai.config.ts`

- [ ] **Step 5: Run the complete verification and push**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`, then `git push origin main`.

---

## Self-review notes

- Every design section maps to a task: Intent/Goals → Tasks 1-7; PDF capability → Tasks 1-2; `@` → Task 6; selection chip → Tasks 5-7; context injection → Task 3; request validation → Task 4; tests → Task 8.
- The five Review Focus items are pinned by tests in Tasks 5, 6, 7, 4 and 1 respectively.
- Signatures are consistent across tasks: `extractPdfText`, `read_pdf`, `selection` object shape, and the five-argument `send`.
- No task depends on code from a later task; Tasks 1-2 are foundation, 3-4 backend, 5-7 frontend, 8 verification.
