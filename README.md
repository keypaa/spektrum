# Spektrum

A 1:1 replacement for OpenAI Prism — a LaTeX editor with live PDF preview, SyncTeX, a
logs panel and an AI that edits the document in place. Built for the same work, in the
same browser, with the same muscle memory.

Prism shuts down on 1 January 2027. Spektrum is the migration target: import a Prism
export, and every project, file and conversation is where you left it.

**Status:** phases 0–5 complete. 702 unit tests, 25 behavioural e2e, 9 AI e2e, and the
reference production stack in `docker/compose.prod.yml`.

## Quick start (development)

Requires Node 26.13.0 and pnpm 12.18.0 (pinned in `.node-version`, `.mise.toml`,
`package.json` and `.npmrc` — the install fails rather than running on another version).

```bash
pnpm install
docker compose -f docker/compose.dev.yml up -d postgres redis seaweedfs
./scripts/dev-db.sh          # creates spektrum / spektrum_test / spektrum_unit + citext
cp .env.example apps/web/.env.local
pnpm dev                     # http://localhost:3000
```

Sign-up is closed. Create the first owner, then sign in:

```bash
pnpm --filter @spektrum/web admin:create-owner --email you@example.com
```

The compile worker spawns a TeX Live container per job, so build that image once:

```bash
./scripts/build-texlive.sh
```

## Production

The reference kit is a plain `docker compose` project — no cloud provider, every host
value in `.env`.

```bash
cp .env.example .env && $EDITOR .env
TEXLIVE_IMAGE=spektrum-texlive:local ./scripts/build-texlive.sh
./scripts/deploy.sh
```

`web`, `worker`, `caddy`, `postgres`, `redis`, `seaweedfs` and a one-shot `migrate`
service. Only Caddy publishes ports. The full runbook — provisioning, backups, restore,
rollback, security notes, troubleshooting — is
[`zenno/docs/phase-5-launch.md`](zenno/docs/phase-5-launch.md).

## How it is built

| Path | What |
|---|---|
| `apps/web` | Next.js 16 (App Router, Node runtime, `proxy.ts`), Better Auth, Monaco, the editor UI |
| `apps/worker` | BullMQ worker; compiles in a throwaway TeX Live container via the Docker socket |
| `packages/db` | Drizzle schema and migrations (Postgres 16) |
| `packages/shared` | Contracts shared by web and worker: env schema, rate limits, paths, prompts, logging primitives |
| `packages/latex` | Log parsing, SyncTeX, diagnostics |
| `packages/storage` | S3 client (MinIO/SeaweedFS/R2 — anything S3-compatible) |
| `packages/ui` | Design system: tokens, primitives, icons |
| `docker` | Dev and production compose, Dockerfiles, Caddyfile, TeX Live image |
| `e2e` | Playwright behavioural, visual and AI suites |

Two invariants worth knowing before changing anything:

- **Every mutating route** does `requireUser` → same-origin check → zod parse →
  ownership (`id AND ownerId AND deletedAt IS NULL`) → `errorResponse`. A project you do
  not own is a 404, never a 403.
- **Import is a security boundary.** The archive is sniffed by magic bytes, size-capped
  before parsing, and inflated with a streaming reader that counts *actual* bytes — a
  forged header or a zip bomb is rejected, not trusted.

## Tests

```bash
pnpm test           # unit: 702 passed / 8 skipped (129 files)
pnpm test:e2e       # Playwright behavioural: 25
pnpm test:ai        # AI suite against a mock gateway: 9
pnpm typecheck
pnpm lint
```

CI runs all of the above plus a `pnpm audit --prod --audit-level=high` gate and a job
that builds the three production images. No repository secrets are required.

## Documentation

- [`zenno/specs/2026-11-07-spektrum-design.md`](zenno/specs/2026-11-07-spektrum-design.md) — the specification; the authority on *what* to build
- [`zenno/plans/`](zenno/plans/) — one plan per phase, task by task, with the tests that gate each task
- [`zenno/docs/phase-5-launch.md`](zenno/docs/phase-5-launch.md) — deployment and operations

## Local-only files

A few inputs are deliberately not in git; see
[§10 of the launch runbook](zenno/docs/phase-5-launch.md) for the full list.

- `e2e/fixtures/prism-projects-2026-11-05.zip` — a real Prism export used as the round-trip oracle. Without it the archive-driven tests skip.
- `zenno/recon/{js,css,html,screenshots,fonts}` — third-party captures kept for reference.

`zenno/recon/extracted/` **is** committed: the dev seeds and the templates test read
those files.