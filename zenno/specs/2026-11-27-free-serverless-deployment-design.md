# Free serverless deployment design

Status: draft for approval — branch `free-serverless-deploy`
Date: 2026-11-27
Branch: `free-serverless-deploy` (cut from `main`; `main` keeps the VPS/Caddy path untouched)

## 1. Intent and why

Spektrum should be reachable by anyone who used OpenAI Prism and needs an
alternative. `main` already has a complete single-VPS deployment kit, but the
owner has no paid host and no owned domain — only `keypa.duckdns.org`. This
branch must make the app runnable on a **free** hosting tier with a public URL
containing `spektrum`, without changing `main`.

The release must include the web app, sign-up for ordinary users, optional
OAuth, persistence, PDF compilation, image chat input, and the admin/first-owner
bootstrap that the current invite-only design assumes.

## 2. Goals, non-goals, anti-goals

**Goals**
- Public URL of the form `spektrum.<something>.vercel.app` (or the Cloudflare
  equivalent) with `spektrum` in the host name.
- Zero monthly hosting cost on the free tiers; no DuckDNS/hosting account
  changes required for the app itself.
- Anyone can register and use the editor/chat/compile flow without an invite.
- No regressions to the working product on `main`.

**Non-goals**
- Keeping the Docker Compose stack or Caddy in this branch's deployment path.
- Running TeX Live in a Docker container, or running a permanent worker daemon.
- Custom-domain setup for `keypa.duckdns.org` (impossible on Pages; unnecessary
  once a free platform subdomain is used).

**Anti-goals (what would make this a failure even if it "works")**
- A site that loads but cannot compile documents or persist user work.
- A deployment that needs a credit card or silently bills after a free period.
- A "public" site that still requires an invite to sign up.
- Breaking `main` or mixing this architecture into the VPS path.

## 3. Hard constraints

- **Vercel Hobby** (primary candidate): Node 26 is GA and `engines.node` is
  honoured; pnpm detected from `pnpm-lock.yaml`; Node runtime = full Node APIs;
  2 GB memory / 1 vCPU (fixed on Hobby, not settable); 300 s max function
  duration (including streaming); 4.5 MB request bodies; 100 deployments/day;
  non-commercial fair-use only.
- **Cloudflare Pages** (secondary candidate): Workers runtime is V8 with
  `nodejs_compat`. Native `@node-rs/argon2`, `postgres-js` sockets, `ioredis`,
  BullMQ and `child_process` are not drop-in. This makes Pages a much larger
  rewrite than Vercel; the design targets Vercel first and treats a Pages
  variant as a separate, later port.
- No long-lived process, no Docker socket, no local persistent filesystem, no
  host cron. Serverless functions are stateless and may run many instances.
- Data services must be **free with no card**. DuckDNS can only publish
  A/AAAA, so it cannot CNAME to `*.vercel.app` or `<site>.pages.dev`.
- Node 26.13.0 / pnpm 12.18.0 / `engine-strict` stay pinned.
- Import artefacts and PDFs must remain owner-scoped; no public buckets.

## 4. Target architecture (Vercel Hobby)

```
Browser ──HTTPS──▶ spektrum.vercel.app
                     │  Vercel Edge (TLS, CDN)
                     ▼
              Next.js 16 Node functions (Vercel Hobby)
              · web UI, auth, projects, files, chat, SSE streams
              · signed-URL endpoints + compile-result persistence (stateless)
                     │
      ┌──────────────┼──────────────────┐
      ▼              ▼                  ▼
 Neon Postgres   Upstash Redis      Cloudflare R2
 (users, files,  (rate limits,      (two buckets: uploads, pdf)
  threads,        chat pub/sub,
  messages)       auth cache)
      │
      ▼
 Browser WASM TeX engine (BusyTeX / SwiftLaTeX, packages on demand)
```

Everything that used to be a daemon becomes either a stateless function or a
browser task. Caddy's TLS/CSP/SSE responsibilities move to Vercel + the
existing headers in `apps/web/next.config.ts`. Large files (project imports,
compiled PDFs, pasted images) are uploaded **directly to R2 with signed URLs**,
so Vercel's 4.5 MB request-body cap is never in the path.

## 5. Decisions already made

1. **Platform: Vercel Hobby first.** Reason: Next.js 16 is the app's framework,
   Vercel runs the Node runtime natively, Node 26 and pnpm are supported, and
   SSE/chat streaming works in Node functions. Cloudflare Pages would require
   replacing nearly every server-side dependency and is not a like-for-like
   port.
2. **URL: `spektrum.vercel.app`.** Vercel subdomains are globally unique; if it
   is taken, fall back to `spektrum-<short-suffix>.vercel.app` so `spektrum`
   remains in the hostname. My call — no owned domain is involved.
3. **Free external data services:** Neon (Postgres + `citext`), Upstash Redis
   (TCP endpoint, Lua/pub-sub supported), Cloudflare R2 (S3-compatible,
   `forcePathStyle`, two buckets, no egress). Approved by the owner: both
   third-party free services and platform-native services are acceptable.
4. **Public signup:** `ALLOW_PUBLIC_SIGNUP` is a **Vercel env var set to `true`
   only on this branch's deployment**; the shared code default stays `false`
   for `main`. Bootstrap the first owner locally before enabling it. Email and
   password work with no external service; Google/GitHub OAuth buttons appear
   only when both credentials are configured. Public signups are members;
   there is no admin-promotion path in this branch (a known limitation).
5. **Compile: browser-side WASM TeX** with on-demand package fetch — approved
   by the owner, detailed in §6.
6. **LLM access: BYOK for members.** The server key stays owner-only and the
   owner can still spend with it; members add their own key in Settings.
   Onboarding must say chat needs a key. Abuse of free-tier storage and Redis
   by anonymous accounts is handled by per-user quotas and signup throttling
   (§7), not by an LLM quota subsystem.
7. **Uploads: signed direct-to-R2.** Preserve current import/image limits;
   the browser uploads bytes straight to R2 and the app stores only keys. Every
   signed URL is minted only for the authenticated user and a key under that
   user's project prefix; the route verifies the prefix before persisting the
   key. R2 buckets need CORS allowing PUT from the app origin.
8. **AI transport unchanged.** Chat still uses the existing OpenAI-compatible
   gateway via `LLM_BASE_URL`; members use the BYOK key already supported in
   Settings, and the server key remains owner-only.
9. **Secrets stay out of the repo**; only `.env.example` and docs change.

## 6. Compile pipeline (decided: browser WASM)

The VPS compile pipeline is a permanent BullMQ worker invoking Docker to run a
TeX Live container (30 s timeout, 1 CPU/1 GB, uid 10001), writing PDF + SyncTeX
to S3 and publishing SSE events through Redis. None of that can run on Vercel.

**Decision (owner-approved): compile in the browser.** Load a modern WASM TeX
engine (BusyTeX/TeX Live 2026, or SwiftLaTeX) from an external CDN as static
assets with attribution; nothing is vendored or modified in this repo. On
compile, the client materialises the project files into the engine's memory
filesystem, runs the engine in a Web Worker, shows the PDF with the existing
PDF.js viewer, and uploads PDF/log/SyncTeX to R2 through a signed URL so
server-side history, download and audit still work. Benefits: no worker, no
compute bill, no Docker, no long-running function, no cross-instance lock.
Costs: first visit downloads engine assets (tens of MB), package coverage
depends on the on-demand package server, BibTeX/biber workflows and full TeX
Live parity are not guaranteed.

**Alternative A — server-side WASM in a Node function.** Keeps the current API
shape and history semantics; uses `wasmtex/node` with assets on R2. Fits the
2 GB/300 s Hobby limit for modest documents, but consumes function resources,
needs a server-side package cache, and still cannot match full TeX Live.

**Alternative B — no compile.** Ship an editor + PDF viewer for uploaded PDFs
only. Simplest and cheapest, but removes the feature Prism users most need.

**Chosen: browser WASM, with Alternative B's viewer as the fallback when the
engine cannot be loaded.** The engine is loaded as an external CDN asset with
attribution (AGPL engines are not vendored or modified in this repo).

**Required new API:** today `apps/worker/src/compile.ts` is the only writer of
`pdf_renders`; without it there is no persisted result. Add an ownership-checked
`POST /api/projects/:projectId/renders` that accepts the R2 keys for
PDF/log/SyncTeX and writes the `pdf_renders` row, and rewrite the editor,
render, PDF-chrome and SyncTeX clients to use local compile state plus this
commit call. Without this step the anti-goal "site cannot compile or persist"
is guaranteed.

## 7. Repository changes (what I would actually do)

| Area | Change |
|---|---|
| `next.config.ts` | Make `output: "standalone"` / `outputFileTracingRoot` conditional so Vercel's builder is not fighting the VPS setup. Export `maxDuration = 300` from chat/result routes only (App Router route exports, not `vercel.json`). Extend CSP `connect-src`, `script-src` and `worker-src` for the WASM engine CDN, package server and R2 endpoint; prefer a same-origin rewrite for engine assets. |
| `vercel.json` | New: build command scoped to the web package, rewrites for engine assets, header policy consistent with `next.config.ts`. No function memory setting (fixed at 2 GB on Hobby) and no 20 MiB opt-in (Pro-only). |
| Uploads | Signed-URL endpoints for imports, pasted images and compile results; browser PUTs directly to R2, app persists only verified keys. Update import dialog, file-drop overlay and `composer/image-paste` to upload then post a key. Chat route accepts key-based image attachments on this branch; text-only bodies stay unchanged. |
| `packages/storage/src/index.ts` | Read `S3_ENDPOINT`, `S3_BUCKET`, `S3_PDF_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` (default `auto`), keep `forcePathStyle`. Add presigned PUT/GET via `@aws-sdk/s3-request-presigner` with short expiry; no behaviour change for SeaweedFS/VPS. |
| `apps/web/src/lib/env/validation` | Required keys stay exactly as today (`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `LLM_KEY_ENCRYPTION_SECRET`); add S3 vars to validation. `ALLOW_PUBLIC_SIGNUP` already exists — set it as a Vercel env var, never change the shared default. Update `.env.example` and its test. |
| `apps/web/src/lib/ai/chat` | Keep SSE and the text-only path byte-for-byte; replace inline base64 images with uploaded blob keys on this branch, verifying key prefix and object existence before persisting. Export `maxDuration = 300`. |
| Compile queue/stream | Remove the Docker-backed worker **and** the server render/compile SSE endpoint on this branch; compile progress becomes local UI state. Keep compile DB rows and result shape so history/download work. Chat SSE stays unchanged; Redis pub/sub remains only for chat fan-out. |
| Auth/signup | Set `ALLOW_PUBLIC_SIGNUP=true` as a deployment env var only; bootstrap first owner locally before enabling it. OAuth remains credential-gated. Onboarding states BYOK and that public signups cannot become admins. Early Preview check that `@node-rs/argon2` builds on Vercel's Amazon Linux image; add a pure-JS auth fallback if it fails. |
| Abuse control | Per-user caps for storage bytes, import count and chat turns; signup/IP throttling beyond the existing 5 sign-ins per 15 min. Without this, anonymous accounts can exhaust Upstash/R2 free quotas. My call: implement lightweight DB/Redis counters, no new paid service. |
| Redis client | Long-lived `ioredis` clients must be adapted for stateless functions (Upstash REST client or TCP-compatible wrapper); add a client abstraction and test it on Preview. Verify actual Upstash free quota at provisioning; published numbers conflict. |
| Migrations | Add a documented release step (`pnpm db:migrate` against Neon) and `CREATE EXTENSION IF NOT EXISTS citext`; R2 buckets created once via `wrangler` or dashboard. |
| Tests | Keep the VPS CI green on `main`; add serverless config/env tests and a compile-flow unit test. CI does not deploy this branch. |
| Docs | New `docs/serverless-deployment.md` + linked README entries; cover provisioning, env table, release, backups, limits, and what differs from VPS. |

## 8. Environment variables to provision

**Secrets (Vercel project env / provider dashboards)**

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (with `sslmode=require`) |
| `REDIS_URL` | Upstash Redis TCP URL (or REST URL if client is adapted) |
| `BETTER_AUTH_SECRET` | generated, ≥32 chars |
| `BETTER_AUTH_URL` | `https://spektrum.vercel.app` |
| `LLM_KEY_ENCRYPTION_SECRET` | generated, ≥32 chars |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | `spektrum-uploads` |
| `S3_PDF_BUCKET` | `spektrum-pdf` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | R2 API token scoped to both buckets |
| `S3_REGION` | `auto` |
| `LLM_API_KEY` | optional gateway key for the owner only; members use BYOK, and owner traffic can incur real spend |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | optional OAuth |
| `METRICS_TOKEN` | optional; if unset `/api/metrics` stays 503 |

**Non-secret settings**

| Variable | Value |
|---|---|
| `LLM_BASE_URL` | `https://api.kilo.ai/api/gateway` (default) |
| `LLM_MODEL_CHAT` / `LLM_MODEL_FAST` | defaults already in code |
| `ALLOW_PUBLIC_SIGNUP` | `true` |
| `PUBLIC_URL` | `https://spektrum.vercel.app` (documentation/meta only) |
| `TEXLIVE_IMAGE` | unused on this branch |

`ACME_EMAIL`, `POSTGRES_USER/PASSWORD/DB`, `DOCKER_GID`, `IMAGE_TAG`,
`BACKUP_DEST_ROOT`, `HEALTH_*` are VPS-only and are not required here.

## 9. Deployment procedure (to document)

1. Create Vercel Hobby project from the GitHub repo, branch `free-serverless-deploy`.
2. Create Neon Postgres (enable `citext`), Upstash Redis, R2 buckets + API token.
3. Fill Vercel env vars from §8 for Production and Preview, with
   `ALLOW_PUBLIC_SIGNUP=false` for the first deployment.
4. Run migrations **locally** once: `DATABASE_URL=... pnpm db:migrate` against
   Neon; verify the bucket probe. There is no shell on Vercel.
5. Bootstrap first owner **locally** with `admin:create-owner` against the Neon
   URL (same reason).
6. Deploy; confirm `spektrum.vercel.app`, sign-in, project create, image chat,
   and a compile round-trip.
7. Only after the owner exists, set `ALLOW_PUBLIC_SIGNUP=true` and redeploy;
   verify a fresh signup can register but cannot reach admin routes.
8. Document backups: Neon/Upstash/R2 provider snapshots replace `backup.sh`.

## 10. Testing and verification

- Keep `pnpm test`, `pnpm typecheck`, `pnpm lint` green on this branch.
- New unit tests: env schema for serverless config, storage client against an R2
  endpoint shape, compile flow with a stub WASM engine.
- Manual smoke checklist in the doc: register, create project, edit, compile,
  chat text + image, reload thread, admin invite.
- No automated deploy in CI; the free tier deploy is a one-time manual setup.

## 11. Known limitations (to state openly in the docs)

- Vercel Hobby is non-commercial and fair-use; heavy use can pause the project.
- Node function duration 300 s; huge documents or slow streams can be cut off.
- Browser WASM compile is not identical to full TeX Live (packages, BibTeX,
  fonts); first load is large.
- Neon free scales to zero after inactivity (cold start); R2/Upstash free quotas
  are finite (10 GB storage, 500 k Redis commands/month).
- Serverless instances do not share the module-level import lock; import
  processing must use a Redis lock or move client-side. Compile itself needs no
  cross-instance lock because it runs in the browser.
- Open signup has no admin-promotion path; only the bootstrapped owner/admin can
  manage invites.
- The owner's optional `LLM_API_KEY` can incur real spend; the free-tier goal
  applies to hosting, not owner-initiated AI usage.
- Native `@node-rs/argon2` must build for Vercel's Amazon Linux 2023 image; if
  it fails, auth needs a pure-JS fallback before launch.
- Vercel's monorepo build must be scoped so the worker/Docker targets do not
  break the web build; verify the build command on a Preview deployment.
- DuckDNS remains useful only for the VPS path on `main`.

## 12. Left to the builder (my calls, unless you override)

- Exact WASM engine/package-server choice — **feasibility spike first**: if no
  engine can load from a CDN under the CSP/package constraints, this decision
  must come back to the owner.
- Signed-URL upload shape for PDF/log/SyncTeX and retention policy.
- How to condition `output: "standalone"` for Vercel without touching VPS builds.
- Fallback naming if `spektrum.vercel.app` is already taken.

## 13. Decisions (owner-confirmed)

| Decision | Answer | Consequence for the plan |
|---|---|---|
| Compile | **Browser WASM** | No worker/Docker. Package/BibTeX limits and a large first asset download are accepted; PDF/log/SyncTeX go to R2 via signed URLs. |
| LLM access | **BYOK for members** | Server key stays owner-only; owner traffic can still spend. Onboarding states chat needs a personal key; free-tier abuse is handled by storage/request quotas, not an LLM quota. |
| Upload size | **Signed direct-to-R2** | Current 26 MB imports and image limits survive Vercel's 4.5 MB body cap. Browser uploads bytes to R2; app stores only keys. |
| Providers | **Both are fine** | Neon + Upstash + R2 are approved; platform-native Vercel/Cloudflare services remain an option where useful. |
| OAuth | My call: wired but hidden until credentials are added | Email/password signup works from day one; adding OAuth creds is a config-only change. |
| Data migration | None | Nothing is live on the VPS path; fresh Neon/Upstash/R2 instances are sufficient. |
| WASM licensing | My call: external CDN asset with attribution | No AGPL code vendored or modified in this repo. |
| Abuse control | My call: lightweight DB/Redis counters | Per-user storage/import/chat caps and signup throttling protect free quotas without paid services. |
| Admin promotion | Limitation, not a decision | Public signups are members; only the bootstrapped owner/admin can manage invites. |

The design is complete apart from the WASM engine feasibility spike in §12, and
is awaiting approval before implementation.
