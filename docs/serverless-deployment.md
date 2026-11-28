# Serverless deployment (Vercel Hobby)

This is the runbook for the **free public deployment** on this branch. The
Docker Compose/Caddy stack on `main` is a separate, untouched deployment path;
its runbook is [`zenno/docs/phase-5-launch.md`](../zenno/docs/phase-5-launch.md).
Nothing here changes the VPS path or shared defaults.

Target URL: **`https://spektrum.vercel.app`**. Vercel subdomains are globally
unique — if it is taken, use `spektrum-<short-suffix>.vercel.app` so `spektrum`
stays in the hostname. Substitute that URL everywhere below.

## 1. What this deployment is (and is not)

- Vercel Hobby, Next.js 16 App Router, Node runtime, pnpm 12.18.0 / Node
  26.13.0 (pinned and enforced).
- Neon Postgres, Upstash Redis over **REST only**, and two S3-compatible
  **Backblaze B2** buckets. No credit card is required for any of them.
- Compilation runs in the **browser** via `@siglum/engine@0.2.2` (MIT), loading
  TeX Live 2026 assets from `https://packages.siglum.org`. No AGPL code is
  vendored or modified; the evidence is in
  [`zenno/docs/2026-11-27-wasm-feasibility.md`](../zenno/docs/2026-11-27-wasm-feasibility.md).
- Large files (imports, pasted images, PDF/SyncTeX results) go straight to B2
  through short-lived signed URLs; the app stores only `u/<userId>/<kind>/…`
  keys. See [`compilation.md`](compilation.md) and
  [`image-chat-input.md`](image-chat-input.md).
- **No** Docker socket, permanent worker, local persistent filesystem, or host
  cron. Hobby is **non-commercial/fair-use**, with 4.5 MB request bodies, 2 GB
  fixed memory (not configurable) and 300 s maximum function duration.
- If `spektrum.vercel.app` is already taken, Vercel assigns a suffixed URL such
  as `spektrum-olive.vercel.app`. Use that exact URL in `BETTER_AUTH_URL`,
  `PUBLIC_URL` and the bucket CORS origins — the app's CSRF guard compares
  against `BETTER_AUTH_URL`, so a placeholder URL breaks sign-in.

## 2. Provision the services

### Neon (Postgres)

1. Create a free Neon project; note the region (keep everything near Vercel).
2. In the SQL editor run `CREATE EXTENSION IF NOT EXISTS citext;` — the schema
   depends on it.
3. Copy the **pooled** connection string with `sslmode=require` for
   `DATABASE_URL`. Migrations use the same value (§4).

### Upstash (Redis)

1. Create a free Redis database in the same region.
2. Copy the REST URL and token into `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`.
3. **Leave `REDIS_URL` empty or unset.** `REDIS_URL` wins whenever it has a
   value, and `ioredis` sockets cannot run in Vercel functions. `.env.example`
   ships `REDIS_URL=` (blank) with a VPS/dev comment; keep it blank on Vercel.
   Never copy a `redis://…` value into a Vercel environment variable.

### Backblaze B2 (S3-compatible)

Cloudflare R2 also works but requires a payment method to activate even on its
free tier. B2's first 10 GB is free with no card.

1. Create two **private** buckets: `spektrum-uploads` and `spektrum-pdf` (names
   must be globally unique). Copy the **Endpoint** from each bucket card, for
   example `s3.us-east-005.backblazeb2.com`.
2. Create an **Application Key** with **Read & Write** access to both buckets.
   Set `S3_ENDPOINT=https://<endpoint>`, `S3_REGION=auto`,
   `S3_BUCKET=spektrum-uploads`, `S3_PDF_BUCKET=spektrum-pdf`, and the keyID /
   applicationKey as `S3_ACCESS_KEY` / `S3_SECRET_KEY`. B2's master key does not
   work with the S3 API.
3. Add a **CORS rule on both buckets** allowing **PUT and GET** from the app
   origin (`https://spektrum.vercel.app`, plus a Preview origin if you use one).
   PUT is needed for signed browser uploads; GET is needed for the browser-side
   SyncTeX read (the client follows a signed URL minted by
   `/api/projects/:projectId/render/:revision/synctex/url`). The PDF itself is
   streamed server-side by `/api/projects/:projectId/render/:revision/pdf` via
   `getObject`/`getObjectRange`, so a signed PDF GET is **not** required —
   allowing GET on the PDF bucket is harmless. B2 uses its own CORS format:
```json
[
  {
    "corsRuleName": "spektrum",
    "allowedOrigins": ["*"],
    "allowedOperations": ["s3_put", "s3_get", "s3_head", "s3_delete"],
    "allowedHeaders": ["*"],
    "exposeHeaders": ["ETag"],
    "maxAgeSeconds": 3600
  }
]
```
   A PUT-only policy breaks SyncTeX downloads and a GET-only policy breaks every
   upload. B2 buckets are versioned by default; add a lifecycle rule to keep
   only the latest version if storage grows.

## 3. Environment variables (Vercel project → Production and Preview)

| Variable | Value / source |
|---|---|
| `DATABASE_URL` | Neon pooled URL, `sslmode=require` |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token |
| `REDIS_URL` | **empty or unset** (see §2) |
| `BETTER_AUTH_SECRET` | generated, ≥32 chars (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | `https://spektrum.vercel.app` |
| `LLM_KEY_ENCRYPTION_SECRET` | generated, ≥32 chars; changing it loses BYOK keys |
| `PUBLIC_URL` | `https://spektrum.vercel.app` (documentation/meta only; the CSRF guard uses `BETTER_AUTH_URL`) |
| `S3_ENDPOINT` | `https://<b2-endpoint>` (e.g. `https://s3.us-east-005.backblazeb2.com`; also added to CSP `connect-src`) |
| `S3_BUCKET` | `spektrum-uploads` |
| `S3_PDF_BUCKET` | `spektrum-pdf` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | B2 application keyID / applicationKey |
| `S3_REGION` | `auto` |
| `ENGINE_ASSET_ORIGIN` | `https://packages.siglum.org` (allowlisted CDN in CSP) |
| `ENGINE_PACKAGE_ORIGIN` | `https://packages.siglum.org/api/texlive` (allowlisted package server) |
| `ALLOW_PUBLIC_SIGNUP` | `false` for the first deploy; `true` only after §6 |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_CHAT`, `LLM_MODEL_FAST` | optional server key/defaults; member traffic is BYOK |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | optional; buttons appear only when configured |
| `METRICS_TOKEN` | optional; `/api/metrics` returns 503 without it |
| `SENTRY_DSN` | optional; leave unset unless CSP for the ingest host is added |

`ACME_EMAIL`, `POSTGRES_USER/PASSWORD/DB`, `DOCKER_GID`, `IMAGE_TAG`,
`TEXLIVE_IMAGE`, `HEALTH_PORT`, `BACKUP_DEST_ROOT` and `SENTRY_INGEST_HOST`
are VPS-only or unused here.

The CSP is built by `apps/web/src/lib/serverless-config.ts`: with no engine or
storage origins set it is `'self'`-only; the engine variables add only the pinned CDN
origin and `S3_ENDPOINT` adds its HTTPS origin to `connect-src`. `script-src`
always includes `blob:` and `worker-src 'self' blob:` stays, as required by the
Siglum worker. `vercel.json` also exposes an optional same-origin rewrite
`/engine/:path*` → `https://packages.siglum.org/:path*`; the pinned SDK currently
uses the CDN directly, so the env values above are what make it work today.

## 4. Build and release

`vercel.json` runs `pnpm install --frozen-lockfile` and
`pnpm --filter @spektrum/web build` from the repository root. Vercel sets
`VERCEL=1`, which makes `next.config.ts` skip `output: "standalone"` and makes
the PDF-worker copy script warn and skip the standalone-only server target when
that directory is absent (VPS/dev builds still fail loudly if it is missing).
`maxDuration = 300`
is exported from the chat and render-commit routes.

There is no shell on Vercel, so run schema/owner setup locally against Neon:

```bash
export DATABASE_URL='postgres://…pooled…sslmode=require'
pnpm db:migrate
read -rsp 'owner password: ' OWNER_PASSWORD && export OWNER_PASSWORD
pnpm --filter @spektrum/web admin:create-owner \
  --email you@example.com --name "Your Name"
```

`admin:create-owner` refuses to run twice while an owner exists. If an
`apps/web/.env.local` is present, pass `DATABASE_URL` explicitly as above so
that the stale local value cannot win.

Release order for a fresh project:

1. Import the repo, branch `free-serverless-deploy`, root directory = repo root.
2. Provision §2, fill §3 for Production **and** Preview with
   `ALLOW_PUBLIC_SIGNUP=false`.
3. Run the §4 migration and owner bootstrap against Neon.
4. Build a **Preview** deployment first and confirm `@node-rs/argon2` (native
   module) loads — sign in there before going live. A local hash/verify test
   exists but does not prove the Vercel Amazon Linux build.
5. Deploy Production, run the §5 smoke checklist, then do the §6 signup flip.
6. Rollback = redeploy the previous Vercel deployment. Migrations are additive;
   provider data is not rolled back with code.

## 5. Smoke checklist (fresh project)

All steps are executable from a browser plus the local CLI above; no Vercel
shell is needed.

- [ ] `GET https://spektrum.vercel.app/api/health` → `{"ok":true,...}`. If
      `redis` is `down`, `REDIS_URL` is set or the Upstash values are wrong.
- [ ] Response headers include the full CSP: `default-src 'self'`,
      `script-src … blob:`, `worker-src 'self' blob:`, and `connect-src 'self'
      https://packages.siglum.org https://<endpoint>.backblazeb2.com`.
- [ ] Sign in as the bootstrapped owner (this is the Preview argon2 check).
- [ ] Signup is **closed** before the flip: a fresh browser cannot register.
- [ ] Create a project, create/edit/save a file, reload — content persists.
- [ ] Compile: first load downloads ~30 MB of engine assets; PDF preview, log
      and diagnostics appear; **Reload** shows the persisted render for the
      current revision (the app streams it from B2, no signed PDF GET).
- [ ] Cursor-to-PDF SyncTeX jump works (browser follows a signed SyncTeX GET;
      requires CORS GET on the PDF bucket).
- [ ] Chat text with a BYOK key streams SSE and edits propose diffs; a
      member without a key is told to add one in Settings.
- [ ] Paste an image into chat, send it, reload the thread and see the
      thumbnail (signed PUT to `u/<userId>/chat-image/…` + owner-only read).
- [ ] `Retry without images` after a gateway image rejection; later turns stay
      text-only.
- [ ] `/api/admin/*` is 404 for a member and reachable for the owner.
- [ ] After the flip, a fresh signup registers as a **member** and still cannot
      reach admin routes.

## 6. Public signup and BYOK onboarding

`ALLOW_PUBLIC_SIGNUP` stays `false` in shared code (that protects `main`). Only
**after** the owner exists, set `ALLOW_PUBLIC_SIGNUP=true` as a Vercel
environment variable for Production and redeploy. Verify a fresh signup can
register but cannot reach admin routes. Public signups are members; **there is
no admin-promotion path** on this branch — promote nobody by accident, and plan
to use the bootstrapped owner for administration.

Members use their own key: **Settings → Integrations → LLM API key**. It is
encrypted with `LLM_KEY_ENCRYPTION_SECRET` and never returned in plaintext. The
optional server key is owner-only and owner traffic can incur real spend.

## 7. Quotas and abuse control

Public signup is throttled per IP (3 / 15 min) and sign-in is 5 / 15 min.
Per user: compile 6/min (burst 12) and 60/hour, AI 30/min, uploads 20/min,
imports 10/min. Storage is capped at **256 MiB declared per UTC day**; exceeding
it locks the user out until midnight. Per-object ceilings are 26 MiB (import),
30 MiB (workspace), 1 MiB (chat image) and 20 MiB (render). Every signed key is
checked for the `u/<userId>/<kind>/` prefix and kind before persistence, and
each consumer re-reads the object with `getObject` and rejects it if the **actual**
size exceeds the cap — a presigned PUT cannot enforce content length.

## 8. Backups

There is no `backup.sh` or host cron here. Use provider features: Neon
snapshots/PITR (and branches before risky migrations), Upstash's export/backup
option for rate-limit/auth state, and B2 versioning or a periodic
`rclone`/`b2` copy of both buckets to storage you control. Verify a
restore to a scratch Neon project before relying on it. Keep secrets out of the
repo; only `.env.example` and this document are committed.

## 9. Known limits

- Hobby is non-commercial, fair-use; abuse can pause the project. Request bodies
  are capped at **4.5 MB** (the route's 8 MiB chat guard is unreachable on
  Vercel), memory is a fixed 2 GB, and functions (including SSE streams) are
  cut at **300 s**.
- Upstash REST can `PUBLISH` but **cannot `SUBSCRIBE`**, so Redis-subscribe SSE
  consumers do **not** work on Vercel. Chat SSE is streamed directly from the
  gateway and is unaffected; the old server-side render SSE path does not exist
  on this branch.
- Node cold starts and Neon's scale-to-zero add latency after inactivity; B2
  and Upstash free quotas are finite.
- Browser WASM is not full TeX Live: first load is large (~30 MB wasm plus
  bundles), package coverage depends on `packages.siglum.org`, and BibTeX/biber
  or exotic packages may fail. If the CDN is unavailable, the PDF viewer still
  displays previously uploaded PDFs.
- Import processing has no cross-instance module lock; compile needs none
  because it runs in the browser.
- `@node-rs/argon2` must be validated on a Vercel Preview build before launch.
- No admin promotion for public signups; no Docker, no worker, no local
  persistent filesystem, no host cron.
