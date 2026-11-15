# Phase 5 — Launch Runbook

How to take Spektrum from this repository to a running production instance on
any Docker host. Nothing here is provider-specific: every host value comes from
`.env`, and the same `docker compose` project runs on a VPS, a lab machine or a
Kubernetes node with a Docker runtime.

The reference stack is `docker/compose.prod.yml`:
`caddy` (TLS + proxy) → `web` (Next.js) → `worker` (BullMQ + TeX Live) and
`postgres`, `redis`, `seaweedfs` (S3-compatible object store).

---

## 0. What you need

- A Linux host with Docker Engine 24+ and the Compose plugin, and a domain whose
  DNS points at it.
- Ports 80 and 443 open. Nothing else is published.
- ~4 GB RAM for the app and ~2 GB for the TeX Live image (built once, ~400 MB
  compressed).

## 1. Get the code and the TeX Live image

```bash
git clone <this repo> /opt/spektrum && cd /opt/spektrum
TEXLIVE_IMAGE=spektrum-texlive:local ./scripts/build-texlive.sh
```

The worker spawns that image once per compile. `container.ts` defaults to
`spektrum-texlive:dev` (what local development and CI build), while
`docker/compose.prod.yml` sets `TEXLIVE_IMAGE=spektrum-texlive:local` — so build
the production tag explicitly, as above. `scripts/build-texlive.sh` takes the
tag from the same variable.

## 2. Configure

```bash
cp .env.example .env
$EDITOR .env
```

At minimum, set:

| Variable | Why |
|---|---|
| `PUBLIC_URL` | TLS + the same-origin CSRF guard; must match the browser exactly |
| `ACME_EMAIL` | Let's Encrypt contact |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `DATABASE_URL` | keep them consistent |
| `BETTER_AUTH_SECRET`, `LLM_KEY_ENCRYPTION_SECRET` | 32+ chars each (`openssl rand -base64 32`) |
| `S3_SECRET_KEY` | any long random value |
| `METRICS_TOKEN` | required in production; without it `/api/metrics` answers 503 |
| `DOCKER_GID` | `getent group docker \| cut -d: -f3` |

Generate the secrets, never reuse the example values:

```bash
grep -E '^(BETTER_AUTH_SECRET|LLM_KEY_ENCRYPTION_SECRET|POSTGRES_PASSWORD|S3_SECRET_KEY|METRICS_TOKEN)=' .env
```

## 3. Deploy

```bash
./scripts/deploy.sh
```

It builds the images (`docker compose build`) — unless `IMAGE_REGISTRY` is set,
in which case it pulls pre-built images from that registry — runs the one-shot
`migrate` service (Drizzle migrations + bucket creation) and waits for it,
starts `web`, `worker` and `caddy`, then polls `$PUBLIC_URL/api/health`.
Re-running it is safe.

Then create the first owner (explicit, because it needs a password):

```bash
read -rsp 'owner password: ' OWNER_PASSWORD && export OWNER_PASSWORD
docker compose -f docker/compose.prod.yml exec -T web \
  pnpm admin:create-owner --email you@example.com
```

Signup is closed by default (`ALLOW_PUBLIC_SIGNUP=false`); the owner creates
invites from the app.

## 4. Verify

```bash
curl -fsS "$PUBLIC_URL/api/health"
# {"ok":true,"db":"up","redis":"up"}

curl -fsS -H "authorization: Bearer $METRICS_TOKEN" "$PUBLIC_URL/api/metrics" | head
# process_cpu_user_seconds_total ...

pnpm loadtest "$PUBLIC_URL"
# /login — p50 … p95 … p99 … · non2xx 0
# /api/health — p50 … p95 … p99 … · non2xx 0
```

`/api/metrics` returning 401 means the token header is wrong; 503 means
`METRICS_TOKEN` is unset in production (deliberate: metrics are not public).

## 5. Admin operations

```bash
pnpm admin:ban    <email> --actor <adminEmail> [--reason "spam"]
pnpm admin:suspend <email> --actor <adminEmail> --minutes 60 [--reason "cooldown"]
pnpm admin:unban  <email> --actor <adminEmail>
```

`--actor` is mandatory: every action is written to `admin_actions` with an
attributed admin. Inside the container, prefix with
`docker compose -f docker/compose.prod.yml exec -T web`.

## 6. Backups

`docker/backup.cron` is a host crontab line for `scripts/backup.sh` (03:00
daily). It:

1. prunes old PDF/SyncTeX renders (keeps the last 20 per project and anything a
   snapshot pins — `scripts/prune-renders.ts`),
2. `pg_dump -Fc` into `backups/<date>/db.dump`,
3. copies both buckets into `backups/<date>/objects/` via the S3 API,
4. deletes backup directories older than 7 days.

Install it:

```bash
mkdir -p /var/log && touch /var/log/spektrum-backup.log
( crontab -l 2>/dev/null; sed 's|/opt/spektrum|'"$PWD"'|' docker/backup.cron ) | crontab -
```

**Rehearse the restore.** A backup that has never been restored is a hope, not a
backup:

```bash
./scripts/restore.sh backups/$(date +%F)     # prompts, then stops web+worker first
```

To rehearse without touching production, restore into a scratch Postgres
container and point a temporary `DATABASE_URL` at it.

## 7. Rollback

Re-run the deploy with the previous tag once the images are tagged in a
registry, or restore the data:

```bash
# If you publish images: build/tag the previous version and deploy it.
docker images spektrum-web --format '{{.Tag}} {{.CreatedSince}}'
IMAGE_TAG=<previous> IMAGE_REGISTRY=<registry> ./scripts/deploy.sh

# Otherwise roll the data back (this is the path that always works):
./scripts/restore.sh backups/<last-good>
```

Migrations are forward-only (`drizzle-kit migrate`), so a rollback across a
destructive migration means restoring the dump, not downgrading the schema.

## 8. Security notes

- **Only Caddy publishes ports.** Postgres, Redis and SeaweedFS stay on the
  compose network. Caddy's admin endpoint (2019) is bound inside the container
  and never published.
- **`docker.sock` is mounted into the worker only.** A container with that
  socket can start a privileged container on the host, so the worker is the
  highest-value target in the stack. It runs as a non-root user in the `docker`
  group (`DOCKER_GID`), and it is the only service that needs the mount. If you
  do not need PDF compilation on a given host, do not run the worker there.
- **CSP**: `default-src 'self'`, `worker-src 'self' blob:` for the Monaco
  workers, no third-party script origin (the editor bundle is self-hosted).
  `connect-src` gains the Sentry ingest host only when `SENTRY_INGEST_HOST` is
  set. `next.config.ts` carries the same headers for `next start` without Caddy.
- **SSE**: `flush_interval -1` on the reverse proxy; `encode gzip` does not
  compress `text/event-stream`.
- **Import**: 30 MB by Caddy and by `experimental.proxyClientMaxBodySize`;
  `content-length` is checked before the body is parsed; the archive is
  magic-byte sniffed (`PK\x03\x04`) and then validated entry by entry
  (traversal, absolute, backslash, control chars, over-long, `.`/`..`
  segments, directory and macOS junk, zip bombs by actual inflated bytes).
- **Audit**: `pnpm audit --prod --audit-level=high` is a CI gate.

## 9. Known limitations (deliberate)

- **Import is synchronous** (`200 { report }`), not a job with SSE progress.
  The real archive (3.4 MB, 15 projects) imports in well under the request
  budget; a job would add a worker round trip for no user-visible gain. This is
  a recorded deviation from spec §13.2.7.
- **The §13.1 per-file upload route is not implemented.** Uploads arrive through
  the archive importer; the route is deferred.
- **The object store is SeaweedFS**, not MinIO: MinIO's images were withdrawn
  from Docker Hub and quay.io now requires authentication. The app talks to it
  through the standard S3 client, so any S3-compatible service works — point
  `S3_ENDPOINT` at it and drop the `seaweedfs` service.
- **HTTP request metrics come from Caddy, not from the app.** An in-app counter
  fed by `proxy.ts` would read zero: Next compiles the proxy into its own
  bundle, so it cannot share a registry with the route.
- **Import is serialised inside the web process.** Inflation is synchronous CPU
  work (a 17 MB archive expands to ~286 MB), so `importArchive` takes a
  module-level lock and one import runs at a time. Moving the inflate into a
  worker is the real fix; until then this bounds the blast radius.
- **Per-request metrics** (`caddy_http_requests_total`,
  `caddy_http_request_duration_seconds`) come from `http://caddy:2019/metrics`
  — the `metrics` **global** option, never a site directive, which would publish
  an unauthenticated `/metrics` on `PUBLIC_URL`. That port is not published by
  compose, so only containers on the compose network can scrape it. The app's
  `/api/metrics` exposes process metrics (CPU, heap, event-loop lag) behind
  `METRICS_TOKEN`.
- **The worker image is multi-arch**: the Docker CLI is fetched for
  `TARGETARCH` (`amd64` → `x86_64`, `arm64` → `aarch64`).

## 10. Local-only files (not in git)

Some inputs are deliberately kept out of the repository:

| Path | Why | Who needs it |
|---|---|---|
| `e2e/fixtures/prism-projects-2026-11-05.zip` | a real Prism export: papers, images and chat transcripts | the round-trip acceptance test (`describe.skipIf` skips it when absent) and the one archive-driven parser test |
| `zenno/recon/js/`, `css/`, `html/`, `screenshots/`, `fonts/`, `tokens-*.css` | third-party vendor bundles, captures and fonts | nobody — they are reference material |

`zenno/recon/extracted/` **is** committed: `blank-main.tex`, `example-main.tex` and `editor-ui.md` are read by `src/cli/e2e-seed.ts`, `src/cli/visual-seed.ts` and the templates test.

To run the round trip, drop the archive at `e2e/fixtures/prism-projects-2026-11-05.zip` and run
`STORAGE_IT=1 S3_ENDPOINT=… pnpm exec vitest run apps/web/src/lib/import/roundtrip.test.ts`.

## 11. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `/api/metrics` → 503 | `METRICS_TOKEN` is unset or empty in production. Set it (or remove the line from `.env`) and restart `web`. |
| `/api/metrics` → 401 | Wrong `Authorization: Bearer` value. |
| Every mutating route → 500, health → 200 | A required env value is present but invalid. `docker compose logs web` shows the aggregated `Invalid environment configuration` list; an empty `KEY=` counts as unset. |
| Health → `{"ok":false,"db":"down"}` | Postgres not ready or `DATABASE_URL` wrong; `docker compose logs postgres`. |
| Worker restarts | No Docker socket access: check `DOCKER_GID` matches the host's `docker` group. |
| Compiles fail with "no such image" | `TEXLIVE_IMAGE` not built on this host: `./scripts/build-texlive.sh`. |
| Caddy cannot get a certificate | DNS not pointing at the host, or 80/443 blocked. |
| Import → 413 | Archive over 30 MB, or the proxy truncated the body. |
| Import → 400 `bad_request` | Not a zip (magic bytes), or no `archive` field. |

## 12. The compile e2e

`compile` is a required CI job: seven specs covering type → PDF, errors at the
right line, supersede semantics, the last-good PDF, a 20-page document, the
two-tab conflict, and another owner's render being 404.

Two things make it fragile in a way worth knowing:

- **The object store must have a volume node.** SeaweedFS accepts S3 connections
  and bucket creation before it can store anything, and answers 500 until the
  master has a writable volume. The compose/CI readiness gate asks the master to
  assign in `spektrum-pdf` and restarts the store if it cannot; `packages/storage`
  also retries transient 5xx.
- **Assert on the revision you asked for.** A reload plus an edit produces two
  compiles and the newer one supersedes the older; polling "the latest render" is
  therefore a race. The specs call `POST /api/projects/:id/compile` and wait for
  that revision.

`scripts/compile-diagnostics.ts` prints the queue counts, render statuses and the
tail of the TeX log for any run — use it before guessing. The object store's own
log is the other half: `docker logs seaweedfs`.
