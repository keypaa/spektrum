# Spektrum — Plan Index

**Date:** 2026-11-07
**Spec:** `zenno/specs/2026-11-07-spektrum-design.md` (read it first; every plan argues from it)

The spec is the authority on *what*: tokens, copy, prompts, schemas, security rules.
The plans are the authority on *how*: file paths, signatures, tests, commits.

Each plan produces working, testable software on its own. Do not start a plan before the
previous one's exit criteria pass.

| # | Plan | Scope | Exit criteria |
|---|---|---|---|
| 00 | `2026-11-07-00-foundations.md` | Repo reset, monorepo, tokens + fonts, DB schema, auth (credentials, invites, Google, ban ladder, BYOK), rate limits, dev compose, CI | Owner signs in; invite redeemed; tokens test green; CI green |
| 01 | `2026-11-07-01-shell-dashboard.md` | Dashboard shell, project rows, menus, dialogs, theme switcher component, account menu | Visual diff vs dashboard references ≤ 0.15 % |
| 02 | `2026-11-07-02-editor.md` | Monaco + both themes, LaTeX grammar, folding, tabs, sidebar, file CRUD, composer shell, settings modal | **Complete (2026-11-13).** Open a project, edit, switch tabs, hard refresh preserves state; settings persist. Visual ratios recorded (1.1–3.2 %; ≤ 0.15 % not met, accepted and non-blocking) |
| 03 | `2026-11-07-03-compile-pdf-logs.md` | Worker, TeX image, latexmk, log parser, PDF viewer, SyncTeX, Logs panel, Info panel (Project Info, Versions, Comments, Share) | **Planned (2026-11-13).** Type → PDF < 3 s; errors in Logs at the right line; visual diff vs 18, 29–32, 40, 41 |
| 04 | `2026-11-07-04-ai.md` | LLM proxy, BYOK resolution, context builder, tools, diffs, Fix with AI, Review paper, threads | Accept/reject edits; Fix with AI repairs a broken document |
| 05 | `2026-11-07-05-ship.md` | Import/export, VPS provisioning, TLS, backups, monitoring, hardening | Live URL; real paper authored end to end |

## Phase 1–5 task outline

Shown here so the shape is visible; each becomes its own detailed plan before it starts.

**01 Shell + dashboard** — rail component; dashboard container; project query +
list; row component with hover menu; search; sort; list/grid toggle; Import menu;
New menu; New folder dialog; empty state; shutdown banner (flagged off); theme
switcher + persistence; account chip + menu; Playwright visual harness + baselines.

**02 Editor** — Monaco loader; theme registration from `recon/extracted/monaco-themes.js`;
LaTeX/BibTeX/CSV grammars; folding providers; tab strip + tab state; project sidebar;
file tree; file create/rename/delete; document autosave client; editor preferences wiring;
composer shell (no AI yet); settings modal + all six sections; keyboard shortcuts.

**03 Compile + PDF** — TeX Live image; worker process + BullMQ; revision hash; compile
orchestrator; log parser + fixtures; SSE progress; PDF.js viewer + chrome; zoom/page
controls; floating bar; SyncTeX parser + bidirectional sync; Logs panel with filters;
status pill; render cache + retention.

**04 AI** — model resolution; BYOK decrypt; context builder; system prompt; SSE proxy;
thinking levels; tool schema + executor; diff model + inline widget; accept/reject;
Fix with AI; Review paper; thread persistence; **model-generated thread titles +
"Regenerate title"**; usage metering; error/retry UX.

**05 Ship** — Prism importer + report; export; round-trip test; VPS provisioning;
Caddy + TLS; Postgres/Redis/MinIO hardening; backups; logs + metrics; Sentry;
security review; load test; launch checklist.

## Cross-plan invariants

- Node **26.13.0**, pnpm **12.18.0**, pinned in `.mise.toml` / `.node-version` /
  `package.json` (`engines` + `packageManager`) + `.npmrc engine-strict`; Docker images
  use `node:26-bookworm-slim`. Never a different or older version in a container.
- TypeScript **6.0.3**, `strict`; no `any` in exported signatures. TS 7 is revisited in Phase 4.
- **Next.js 16.4.5**: Turbopack default, `proxy.ts` (never `middleware.ts`), async-only
  `cookies()/headers()/params/searchParams`, `revalidateTag(tag, profile)`, no `next lint`.
  Spec §3.5 is mandatory reading for every agent.
- Auth is **Better Auth 1.7.18** + Admin plugin; signup is gated in one
  `databaseHooks.user.create.before` hook (spec §10.1a).
- All UI copy comes from the spec verbatim; no invented labels.
- **No emoji, no icon fonts, no Unicode glyphs as icons.** Every icon is an inline SVG
  component from `packages/ui/src/icons/`, 16×16 viewBox, `currentColor` only (spec §5.8).
- Every visual value comes from `tokens.css`; no hard-coded hex in components.
- Every mutating route validates with zod at the boundary.
- Every task ends in a commit; no task leaves the tree red.
