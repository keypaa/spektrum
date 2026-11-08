# Phase 0 audit & drift log (2026-11-08)

Full review of the Phase 0 result against
`zenno/plans/2026-11-07-00-foundations.md` and
`zenno/specs/2026-11-07-spektrum-design.md`. Everything below was verified by
running the code, not just reading it: `pnpm typecheck`, `pnpm lint`,
`pnpm test` (114 tests), `pnpm --filter @spektrum/web build`, `pnpm test:e2e`
(3 tests), plus live curl/Playwright smoke tests against the dev server.

## Bugs found and fixed

| # | Bug | Evidence | Fix |
|---|-----|----------|-----|
| 1 | **Banned user kept full access.** `admin.ts` deleted only DB session rows; Better Auth's Redis secondary-storage cache kept the session (and its cached user snapshot) alive, and `requireUser` trusted the cached `banned` flag. Live repro: after `POST /api/admin/users/:id/status {action:"ban"}` the victim still got `200` on `/` and `/api/user/llm-key`. | curl smoke test; `ba:active-sessions-<id>` still present in Redis after ban | `auth/revoke.ts` (new) revokes via `auth.$context.internalAdapter.deleteUserSessions` (DB **and** cache); `admin.ts` calls it after the ban transaction; `requireUser` re-reads `banned`/`ban_expires`/`role` from Postgres on every request and fails closed. `ban-cache.test.ts` drives the real handler: `get-session` returns `null` after `banUser`. |
| 2 | `requireUser` called `auth.api.revokeUserSessions` — an admin-session endpoint — from a plain user request. Wrong API, and it would have thrown. | better-auth `routes.mjs`: `use: [adminMiddleware]` | replaced by the internal adapter (see #1) |
| 3 | Invalid/stale session cookie produced **500** on `/` and `/api/admin/invites`. | `curl -H 'Cookie: better-auth.session_token=bogus'` → 500 | `auth/route-errors.ts` maps `UnauthorizedError`→401, `ForbiddenError`→403/429+`Retry-After`, `CsrfError`→403, `ZodError`→400, unknown→generic 500 (no internals leaked). All four API routes wrapped; `(app)/page.tsx` redirects to `/login` on `UnauthorizedError`. Now: `/` → 307 `/login?from=/`, API → 401 JSON. |
| 4 | `proxy.ts` only looked for `better-auth.session_token`; over https Better Auth emits `__Secure-better-auth.session_token`, so the gate would have let production traffic through unchecked. | better-auth `cookies/index.mjs` | both names accepted; `/api/*` without a cookie now gets 401 JSON instead of a login redirect |
| 5 | `adminRoles: ["admin"]` excluded `owner`, and no role named `owner` existed in the admin plugin's access controller, so the owner had no admin permissions in Better Auth's own endpoints. | spec §10.1 "owner and admin both receive adminAc.statements" | `adminRoles: ["owner","admin"]` + `roles: { owner: adminAc, admin: adminAc, member: userAc }` |
| 6 | Sessions were Redis-only: with `secondaryStorage` set and `storeSessionInDatabase` unset, Better Auth stores sessions in the cache, not the DB — contradicting spec §10.3 "database sessions" and making `sessions` rows meaningless at runtime. | `select count(*) from sessions` = 0 after live sign-ins | `session.storeSessionInDatabase: true` — DB is the store of record, Redis an additional cache + rate-limit store |
| 7 | GitHub provider was entirely missing (spec §10.4: "provider written, disabled until credentials exist"). | — | conditional `socialProviders.github` gated on `GITHUB_CLIENT_ID/SECRET`, `disableImplicitSignUp: true` |
| 8 | Login page had no Google button (plan Task 9 requires it when `GOOGLE_CLIENT_ID` is set). | — | server wrapper `login/page.tsx` (force-dynamic) + `login-form.tsx` with conditional Google/GitHub buttons |
| 9 | Invite page never validated the token server-side and never showed the bound email (plan Tasks 11/13). | — | `getInviteStatus(token)` in `invites.ts`; server `invite/[token]/page.tsx` rejects invalid/revoked/used/expired with a message, otherwise renders the form with the bound email + Google `requestSignUp: true` |
| 10 | `POST /api/auth/invite/redeem` leaked raw error messages and had no rate limit (it lives under `/api/auth/*` but is our own handler, so Better Auth's limiter does not cover it). | 7 bogus attempts all 400 with internals | `RedeemError` class — only its messages reach the client; unique-violation mapped to a friendly error; per-IP token bucket `BUDGETS.inviteRedeem` (5/15 min) → 429 + `Retry-After`. Live: 5×400 then 429; cross-origin → 403 |
| 11 | `createInvite` happily invited an email that already has an account (existence oracle). | — | rejected via `findUserByEmail` (citext, case-insensitive) |
| 12 | `hasValidInvite` did not normalise the email. | — | trims + lowercases |
| 13 | `GET /api/admin/invites` serialised `token_hash`. | — | `listInvites` selects safe columns only |
| 14 | `POST /api/admin/invites` called `requireAdmin()` twice. | — | once |
| 15 | `create-owner` CLI: `args[args.indexOf("--email")+1]` returned `args[0]` when `--email` was absent; and `select ... for update` locks nothing when no owner row exists, so two concurrent bootstraps could both win. | — | `argValue()` supports `--flag value` and `--flag=value`; `pg_advisory_xact_lock` serialises bootstraps |
| 16 | `admin_actions.ip` was `text`, spec §4 says `inet`. | — | schema + migration `0001` (`SET DATA TYPE inet USING ip::inet`), applied to spektrum/spektrum_test/spektrum_unit |
| 17 | `projects.main_document_id` had no FK. | — | FK to `documents.id` `ON DELETE set null` (migration `0001`; `AnyPgColumn` breaks the type cycle) |
| 18 | `IconBrand`'s path escaped the 16×16 viewBox (minX −6.1, minY −0.2) — the glyph rendered clipped/off-centre. | path bbox computed programmatically | redrawn as 6 rotated ellipses + hub, all inside 0..16; geometry regression test added |
| 19 | `zod` was a runtime import of `@spektrum/shared` (`env.ts`) but only a devDependency. | — | moved to `dependencies` |
| 20 | Plan Task 8 interface `issueCsrfCookie()` was missing. | — | added (non-HttpOnly `spektrum.csrf` cookie, `SameSite=Strict`) + test. Routes rely on `assertSameOrigin` (unforgeable cross-site) + SameSite=Lax; the double-submit pair is the tested fallback for non-browser clients |
| 21 | No `/api/health` route although `proxy.ts` allowlisted it. | — | `GET /api/health` → 200 only when Postgres + Redis answer, else 503 |
| 22 | Plan Task 14's `llm-key/route.test.ts` did not exist. | — | added (mocked `next/headers` + real session via `auth.handler`): 400 on bad shape, key never echoed, stored encrypted, DELETE clears, no session → 401 not 500 |
| 23 | CI used `actions/setup-node` with `cache: pnpm` but never installed pnpm (`pnpm/action-setup` missing) — every job would fail at the cache step. | — | `pnpm/action-setup@v4` before `setup-node` in all 4 jobs |
| 24 | e2e signup test only asserted 403, not "no user row". | — | also asserts `invite_required` in the body and that signing in with those credentials returns 401 |
| 25 | vitest could not resolve the `@/` alias used by `apps/web` route code. | — | `resolve.alias` in the `web` project of `vitest.config.ts` |

## Justified drift (plan/spec vs implementation)

- **Vitest 5 `projects` instead of `vitest.workspace.ts`** — Vitest 5 removed the
  workspace file; `projects` in `vitest.config.ts` is the replacement.
- **`pool: "forks"` + `maxWorkers: 1` instead of `singleFork`** — Vitest 4+
  removed `singleFork`; `maxWorkers: 1` gives the sequential DB-test execution the
  plan wanted.
- **Direct Drizzle inserts for owner bootstrap and invite redemption** —
  `auth.api.createUser({ context })` does not propagate context into
  `databaseHooks`, so the signup gate could not see `allowBootstrap`. The
  transactional direct insert is the working escape hatch (documented in code).
- **Token-bucket limiter instead of sliding window** — spec §10.5 asks for a
  "sliding-window limiter"; the Lua token bucket enforces the same budgets
  (sustained limit + burst) atomically across instances. Budgets match the spec
  exactly (verified by test).
- **`ci-seed.ts` lives in `apps/web/src/cli/`** — it needs the web app's env
  loading; `scripts/` would have required a second tsconfig path.
- **`pdf_renders.status` includes `queued`** — spec §4 lists `ok|error` for the
  table but §19.3's SSE contract uses `queued|building|rendered|error`; the enum
  covers the job lifecycle. Default `queued` (test-pinned).
- **`minio/minio:latest` / `minio/mc:latest` in compose** — plan says
  `minio/minio` unpinned; we kept `latest` because the sandbox registry proxy
  blocks those images, so no tag could be smoke-tested here. Postgres
  (`postgres:16-alpine`) and Redis (`redis:7-alpine`) verified healthy. Pin a
  release tag before deploying.
- **MinIO smoke test not run in this sandbox** — registry proxy denies
  `minio/minio` and `minio/mc`; Postgres/Redis subset of compose verified
  healthy. Environment limitation, not a code defect.
- **`verifyCsrf` not wired into every route** — every mutating route enforces
  `assertSameOrigin` (Origin cannot be forged by a cross-site browser) and the
  session cookie is `SameSite=Lax`; the double-submit pair is implemented and
  tested for non-browser clients.
- **Compose uses Postgres 16** (AGENTS.md mentions `postgres:18-bookworm` for
  local ad-hoc use); the plan pins `postgres:16-alpine` for compose/CI, which is
  what ships.

## Verification (all green at commit time)

- `pnpm typecheck` — 0 errors (Node 26.13.0 / pnpm 12.18.0 per repo pins)
- `pnpm lint` — clean
- `pnpm test` — 22 files, 114 tests passed
- `pnpm --filter @spektrum/web build` — compiled, all routes dynamic as intended
- `pnpm test:e2e` — 3 passed (owner sign-in, wrong password, closed signup)
- Live smoke: bogus cookie → 307 to `/login` on pages, 401 JSON on APIs;
  banned user's pre-ban cookie → 307/401 immediately after ban; redeem route →
  400×5 then 429 + `Retry-After`, cross-origin → 403; `/api/health` → 200.
