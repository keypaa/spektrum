# Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an empty repository into a running, authenticated, themed skeleton of Spektrum — tokens and fonts in place, Postgres schema migrated, owner sign-in and invite-only registration working, bans and rate limits enforced, BYOK keys stored encrypted, dev environment in Docker, CI green.

**Architecture:** pnpm monorepo. `apps/web` is Next.js 16 (App Router, RSC) and owns HTTP, auth and UI. `packages/db` owns the Drizzle schema and migrations. `packages/shared` holds zod contracts and cross-cutting helpers. Design tokens live in `packages/ui/styles/tokens.css` and are generated from the recon evidence, never retyped. Postgres, Redis and MinIO run in Docker Compose for development.

**Tech Stack:** Node **26.13.0**, pnpm **12.18.0**, TypeScript **6.0.3** (`strict`), Next.js **16.4.5**, React **19.3.1**, Tailwind CSS **4.3.5**, Drizzle ORM **0.45.4** + `postgres` **4.1.0**, **Better Auth 1.7.18** + `@better-auth/drizzle-adapter` 1.7.18 (database sessions, admin plugin), `@node-rs/argon2` 2.2.2, zod **4.6.7**, ioredis, Vitest **5.1.0**, Playwright 1.65.0. Exact pins and rationale: spec §3.2/§3.4.

**Spec:** `zenno/specs/2026-11-07-spektrum-design.md` — read §3.4, §3.5, §10 and §19 before writing any code.

## Global Constraints

- Runtime and toolchain versions are pinned **in the repo**: `.mise.toml` (node 26.13.0, pnpm 12.18.0), `.node-version`, `package.json` (`packageManager`, `engines`), `.npmrc` with `engine-strict=true`. Never "whatever is installed"; Docker uses `node:26-bookworm-slim` (same major, never older).
- **We are on Next.js 16.4.5, not 15.** Spec §3.5 is mandatory reading: Turbopack is default (no `--turbopack` flag), `proxy.ts` not `middleware.ts`, `cookies()/headers()/params/searchParams` are async-only, `next lint` is gone, `revalidateTag(tag, profile)` needs two args, parallel-route slots need `default.tsx`. When in doubt, run `pnpm dlx @next/codemod@canary agents-md` once and read `AGENTS.md`.
- TypeScript `strict` (plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); no `any` in exported signatures.
- Every colour, radius, shadow and font size comes from `tokens.css`; **no hex literals in components**. The only place hex appears is `packages/ui/styles/tokens.css`, which is copied from `zenno/recon/tokens-*.css` and `zenno/recon/css/*.css`.
- UI copy is verbatim from the spec. Do not paraphrase labels.
- **No emoji, no icon fonts, no Unicode glyphs as icons.** Every icon is an inline SVG
  component from `packages/ui/src/icons/`, `viewBox="0 0 16 16"`, `currentColor` only
  (spec §5.8). Do not add `lucide-react`, `react-icons`, or any icon package.
- Every route handler validates input with zod at the boundary and returns `{ error: string }` with the right status.
- Theme preference key is **`crixet_light_mode_preference_v1`**, values `light | dark | system`, default `dark`, with `class="dark"` on `<html>` plus `data-theme` and `data-theme-preference`.
- Passwords: Argon2id `m=19456, t=2, p=1`, 16-byte salt, 32-byte output, minimum 12 characters, wired in as Better Auth's `emailAndPassword.password.{hash,verify}`.
- Sessions: Better Auth database sessions — opaque token, `HttpOnly; Secure; SameSite=Lax`, 30-day rolling expiry, revocable server-side, `cookieCache` disabled so bans apply on the next request.
- Registration is **closed**: creation is gated by one `databaseHooks.user.create.before` check (spec §10.1a); accounts come from invites or the owner CLI only. Public signup is behind `ALLOW_PUBLIC_SIGNUP=false` for v1.
- All timestamps are `timestamptz` in UTC. Emails are `citext` and compared case-insensitively.
- Nothing is compiled in this phase; no Monaco, no worker.

## Review Focus

The spec implies these and no task's tests would otherwise cover them. Each gets a test in the task that owns the code.

1. **Password-reset token reuse** — a second use of the same token, after success or after a password change, must fail.
2. **Invite redemption race** — two concurrent redemptions of one invite must create exactly one account.
3. **Banned user with a live session** — a cookie issued before the ban must stop working on the very next request.
4. **Email case and whitespace** — `A@B.com ` and `a@b.com` are the same account; an invite bound to one matches the other.
5. **Key handling leakage** — a stored LLM key must never appear in any API response, log line, or error message.

---

### Task 0: Back up and reset the repository

**Files:**
- Create: `~/Work/spektrum-pre-reset-2026-11-07.tar.gz`
- Delete: `.git/`, `client/`, `server/`, `shared/`, `docs/`, `scripts/`, `package-lock.json`, `README.md`, `.gitignore`
- Preserve: `zenno/specs/`, `zenno/plans/`, `zenno/recon/`

**Interfaces:**
- Consumes: nothing
- Produces: an empty git repository whose only content is `zenno/`

- [x] **Step 1: Create the backup outside the repo**

```bash
mkdir -p ~/Backups
tar --exclude='node_modules' -czf ~/Backups/spektrum-pre-reset-2026-11-07.tar.gz -C /home/keypaa/Work spektrum
tar -tzf ~/Backups/spektrum-pre-reset-2026-11-07.tar.gz | head -20
```

Expected: the listing contains `spektrum/client/src/App.tsx`, `spektrum/zenno/recon/css/0xv4fsl8j2nmr.css`, and `spektrum/docs/PRD.md`.

- [x] **Step 2: Verify the archive is readable and complete**

```bash
tar -tzf ~/Backups/spektrum-pre-reset-2026-11-07.tar.gz | wc -l
du -h ~/Backups/spektrum-pre-reset-2026-11-07.tar.gz
```

Expected: > 300 entries, archive between 5 MB and 60 MB. If the count is 0, stop and report.

- [x] **Step 3: Preserve the design evidence separately**

```bash
cp -r /home/keypaa/Work/spektrum/zenno /home/keypaa/Work/spektrum-backup-2026-11-07/zenno
```

The full pre-reset tarball also lives at
`/home/keypaa/Work/spektrum-backup-2026-11-07/pre-reset-2026-11-07.tar.gz`
(488 entries: `.git` history, all source, `CLAUDE.md`, `package-lock.json`).
`node_modules` (395 MB) and `dist` are excluded — they regenerate from `package.json`.

- [x] **Step 4: Wipe**

```bash
cd /home/keypaa/Work/spektrum
rm -rf .git client server shared docs scripts package-lock.json README.md .gitignore CLAUDE.md
```

- [x] **Step 5: Re-initialise and commit**

```bash
cd /home/keypaa/Work/spektrum
git init -b main
git add zenno
git commit -m "chore: reset repository, keep design evidence"
```

Expected: `git log --oneline` shows one commit; `git status` is clean.

---

### Task 1: Monorepo skeleton, pinned toolchain, TypeScript, lint, CI gate

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `.npmrc`
- Create: `.mise.toml` (node 26.13.0, pnpm 12.18.0), `.node-version` (`26.13.0`)
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`
- Create: `vitest.config.ts`, `vitest.workspace.ts`
- Create: `AGENTS.md` (generated by `pnpm dlx @next/codemod@canary agents-md`, then committed) — points coding agents at the Next 16 docs

**Interfaces:**
- Consumes: Task 0's empty repo
- Produces: `pnpm -r exec tsc --noEmit` passes; `pnpm test` runs (zero tests); workspace packages resolvable as `@spektrum/db`, `@spektrum/shared`, `@spektrum/ui`; `node --version` inside the project resolves to 26.13.0 via mise

- [x] **Step 1: Write the workspace files**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Root `package.json`:

```json
{
  "name": "spektrum",
  "private": true,
  "packageManager": "pnpm@12.18.0",
  "engines": { "node": ">=26 <27" },
  "scripts": {
    "dev": "pnpm --filter @spektrum/web dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r exec tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint .",
    "db:generate": "pnpm --filter @spektrum/db generate",
    "db:migrate": "pnpm --filter @spektrum/db migrate"
  },
  "devDependencies": {
    "typescript": "6.0.3",
    "vitest": "5.1.0",
    "@types/node": "^26.0.0",
    "eslint": "^10.14.0"
  }
}
```

`.mise.toml` (repo root — overrides the machine's global mise config for this project):

```toml
[tools]
node = "26.13.0"
pnpm = "12.18.0"
```

`.node-version` contains exactly `26.13.0`. `.npmrc` contains:

```
engine-strict=true
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true
  }
}
```

`.gitignore`:

```
node_modules/
.next/
.next/dev/
dist/
coverage/
.env
.env.local
*.tsbuildinfo
playwright-report/
test-results/
```

`apps/web/next.config.ts` — Next 16 shape: top-level `turbopack` only if needed, **no**
`--turbopack` flags in scripts, `cacheComponents` left off, no `eslint` key
(`next lint` is removed in 16):

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [x] **Step 2: Create the package manifests and tsconfigs**

Each package's `tsconfig.json` extends `../../tsconfig.base.json` and sets
`"include": ["src/**/*.ts"]`. `packages/shared/src/index.ts` exports nothing yet but must exist.

`packages/shared/package.json`:

```json
{
  "name": "@spektrum/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "build": "tsc --noEmit" }
}
```

`apps/web/package.json` lists `next@16.4.5`, `react@19.3.1`, `react-dom@19.3.1`,
`better-auth@1.7.18`, `@better-auth/drizzle-adapter@1.7.18`, `@spektrum/db`,
`@spektrum/shared`, `@spektrum/ui`, plus `@types/react`, `@types/react-dom`.
Do not add `next-auth`.

- [x] **Step 2b: Verify the toolchain pin is real**

```bash
mise use node@26.13.0 pnpm@12.18.0   # inside the repo, writes .mise.toml
node --version    # v26.13.0
pnpm --version    # 12.18.0
cd /tmp && node --version   # still the global one — proves the pin is per-repo
cd - >/dev/null
```

- [x] **Step 3: Verify the workspace resolves**

```bash
pnpm install
pnpm typecheck
```

Expected: exit 0, no diagnostics.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: pnpm monorepo skeleton with strict TypeScript"
```

---

### Task 2: Design tokens and fonts, copied from evidence

**Files:**
- Create: `packages/ui/styles/tokens.css`
- Create: `packages/ui/src/tokens.test.ts`
- Copy: `zenno/recon/fonts/*.woff2` → `apps/web/public/fonts/CrixetSans/`
- Copy: `zenno/recon/tokens-root.css`, `tokens-light.css`, `tokens-dark.css` → `zenno/recon/` (already there; do not move)

**Interfaces:**
- Consumes: nothing
- Produces: `tokens.css` defining every variable in spec §5.2–§5.4; a test that fails if any pinned value drifts

- [x] **Step 1: Assemble `tokens.css` mechanically**

Concatenate, in this order, into `packages/ui/styles/tokens.css`:

1. The contents of `zenno/recon/tokens-root.css`, wrapped in `:root { … }` (strip the
   outer `:root{`/`}` that the extractor left).
2. The contents of `zenno/recon/tokens-light.css`, wrapped in
   `html:not(.dark), html.dark .force-light { … }`.
3. The contents of `zenno/recon/tokens-dark.css`, wrapped in
   `html.dark, html:not(.dark) .force-dark { … }`.
4. The `@font-face` block below.

```css
@font-face { font-family: "Crixet Sans"; src: url("/fonts/CrixetSans/CrixetSans-Light.woff2") format("woff2"); font-weight: 300; font-style: normal; font-display: block; }
@font-face { font-family: "Crixet Sans"; src: url("/fonts/CrixetSans/CrixetSans-Regular.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: block; }
@font-face { font-family: "Crixet Sans"; src: url("/fonts/CrixetSans/CrixetSans-Medium.woff2") format("woff2"); font-weight: 500; font-style: normal; font-display: block; }
@font-face { font-family: "Crixet Sans"; src: url("/fonts/CrixetSans/CrixetSans-Semibold.woff2") format("woff2"); font-weight: 600; font-style: normal; font-display: block; }
@font-face { font-family: "Crixet Sans"; src: url("/fonts/CrixetSans/CrixetSans-Bold.woff2") format("woff2"); font-weight: 700; font-style: normal; font-display: block; }
@font-face { font-family: "Crixet Sans"; src: url("/fonts/CrixetSans/CrixetSans-RegularItalic.woff2") format("woff2"); font-weight: 400; font-style: italic; font-display: block; }
@font-face { font-family: "Crixet Sans"; src: url("/fonts/CrixetSans/CrixetSans-MediumItalic.woff2") format("woff2"); font-weight: 500; font-style: italic; font-display: block; }
@font-face { font-family: "Crixet Sans"; src: url("/fonts/CrixetSans/CrixetSans-SemiboldItalic.woff2") format("woff2"); font-weight: 600; font-style: italic; font-display: block; }
@font-face { font-family: "Crixet Sans"; src: url("/fonts/CrixetSans/CrixetSans-BoldItalic.woff2") format("woff2"); font-weight: 700; font-style: italic; font-display: block; }
@font-face { font-family: "Crixet Sans"; src: url("/fonts/CrixetSans/CrixetSans-LightItalic.woff2") format("woff2"); font-weight: 300; font-style: italic; font-display: block; }
```

Do **not** hand-write the token values; if the extractor output looks malformed, re-run
the extraction instead of typing hexes.

- [x] **Step 2: Copy the fonts**

```bash
mkdir -p apps/web/public/fonts/CrixetSans
cp zenno/recon/fonts/*.woff2 apps/web/public/fonts/CrixetSans/
ls apps/web/public/fonts/CrixetSans | wc -l
```

Expected: `10`.

- [x] **Step 3: Write the drift test**

`packages/ui/src/tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");

const DARK = {
  "--neutral-900": "#161616",
  "--bg-app": "#161616",
  "--bg-code": "#000000",
  "--bg-sidepanel": "#1f1f1f",
  "--fg-primary": "#ffffff",
  "--fg-secondary": "#999999",
  "--border-code": "#2a2a2a",
  "--modal-bg": "#1f1f1f",
  "--ai-bg": "#161616",
  "--button-primary-bg": "#ffffff",
  "--brand-500": "#81d6ee",
  "--red-500": "#ff3d2f",
  "--radius-lg": "8px",
  "--shadow-surface": "0 10px 24px #0000001f,0 1px 2px #00000014",
} as const;

const LIGHT = {
  "--neutral-100": "#f1f1f1",
  "--bg-app": "#f1f1f1",
  "--bg-code": "#ffffff",
  "--bg-sidepanel": "#f1f1f1",
  "--fg-primary": "#000000",
  "--border-code": "#afafaf",
  "--modal-bg": "#ffffff",
  "--ai-bg": "#ffffff",
  "--button-primary-bg": "#161616",
} as const;

function declared(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`${name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;}]+)`));
  return m?.[1]?.trim().replace(/\s+/g, " ");
}

function section(marker: string): string {
  const i = css.indexOf(marker);
  const j = css.indexOf("}", i);
  return css.slice(i, j);
}

describe("design tokens", () => {
  it("pins the dark theme values", () => {
    const dark = section("html.dark");
    for (const [k, v] of Object.entries(DARK)) {
      expect(declared(dark, k), k).toBe(v);
    }
  });

  it("pins the light theme values", () => {
    const light = section("html:not(.dark)");
    for (const [k, v] of Object.entries(LIGHT)) {
      expect(declared(light, k), k).toBe(v);
    }
  });

  it("declares all ten Crixet Sans faces", () => {
    expect(css.match(/font-family: "Crixet Sans"/g)).toHaveLength(10);
  });
});
```

Note: some values are aliases (`--bg-app: var(--neutral-900)`, `--radius-lg: var(--radius)`).
Where the alias chain is used, the test compares the top-level declaration text, so pin
the alias form the extraction produced and adjust the expected string once, at authoring
time, from the file itself.

- [x] **Step 4: Run the test**

```bash
pnpm vitest run packages/ui/src/tokens.test.ts
```

Expected: 3 passing. If a value mismatches, the expected value in the test is correct
per the spec (§5.4) — fix `tokens.css`, not the test.

- [x] **Step 5: Commit**

```bash
git add packages/ui apps/web/public/fonts
git commit -m "feat(ui): design tokens and Crixet Sans from recon evidence"
```

---

### Task 3: Tailwind, base styles, theme bootstrap

**Files:**
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/components/theme-script.tsx`
- Test: `apps/web/src/components/theme-script.test.ts`
- Create: `packages/ui/src/icons/index.tsx` (the SVG icon registry — spec §5.8)
- Test: `packages/ui/src/icons/icons.test.ts`
- Modify: `apps/web/package.json` (add `tailwindcss`, `@tailwindcss/postcss`, `postcss.config.mjs`)

**Interfaces:**
- Consumes: `packages/ui/styles/tokens.css`
- Produces: `THEME_STORAGE_KEY` constant, `themeInitScript: string`, `<html>` always carrying `class`, `data-theme`, `data-theme-preference`, and an `Icon*` component per icon in spec §5.8

- [x] **Step 1: Write the failing test**

```ts
import { THEME_STORAGE_KEY, themeInitScript } from "./theme-script";

describe("theme bootstrap", () => {
  it("uses Prism's storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("crixet_light_mode_preference_v1");
  });

  it("defaults to dark", () => {
    expect(themeInitScript).toContain('?? "dark"');
  });

  it("sets the three attributes Prism sets", () => {
    for (const attr of ["classList.toggle", "dataset.theme", "dataset.themePreference", "colorScheme"]) {
      expect(themeInitScript).toContain(attr);
    }
  });
});
```

- [x] **Step 2: Run it and watch it fail**

`pnpm vitest run apps/web/src/components/theme-script.test.ts` → FAIL, module not found.

- [x] **Step 3: Implement**

`theme-script.ts` exports:

```ts
export const THEME_STORAGE_KEY = "crixet_light_mode_preference_v1";
export type ThemePreference = "light" | "dark" | "system";
export const themeInitScript: string = /* the exact IIFE from spec §5.1, keyed on THEME_STORAGE_KEY */;
```

`layout.tsx` renders:

```tsx
<html lang="en" suppressHydrationWarning>
  <head>
    <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
    <link rel="preload" as="font" type="font/woff2" href="/fonts/CrixetSans/CrixetSans-Regular.woff2" crossOrigin="anonymous" />
  </head>
  <body className="font-sans antialiased">{children}</body>
</html>
```

`globals.css` starts with `@import "tailwindcss";`, then `@import "@spektrum/ui/styles/tokens.css";`,
then a `@theme` block mapping the token variables to Tailwind utility names
(`--color-bg-app`, `--color-fg-primary`, `--font-sans: "Crixet Sans", ui-sans-serif, system-ui, sans-serif`,
`--font-mono: "roboto_mono", ui-monospace, …`).

Next 16 specifics for this task: `layout.tsx` must not read `params`/`cookies()`
synchronously (they are Promises in 16 — spec §3.5); `next build` no longer runs ESLint,
so lint runs as its own CI job; and we do **not** add `data-scroll-behavior="smooth"` —
Prism's editor pane manages its own scroll.

- [x] **Step 3b: Create the icon registry (spec §5.8)**

Write `packages/ui/src/icons/index.tsx`. One component per icon in the spec's list,
each of the shape:

```tsx
export function IconSearch({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
         strokeLinejoin="round" aria-hidden="true" className={className}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  );
}
```

Phase 0 needs only the icons the login page and error states use — `IconSearch`,
`IconWarning`, `IconError`, `IconInfo`, `IconCheck`, `IconClose`. **Do not** hand-author
the remaining ~40 now; each later phase adds exactly the icons it needs. Do not add an
icon package.

`packages/ui/src/icons/icons.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "./index";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{2BFF}]/u;

describe("icon registry", () => {
  it("exports components named Icon*", () => {
    for (const [name, value] of Object.entries(icons)) {
      expect(name, name).toMatch(/^Icon[A-Z]/);
      expect(typeof value, name).toBe("function");
    }
  });

  it("uses a 16x16 viewBox and currentColor only", () => {
    for (const [name, Icon] of Object.entries(icons)) {
      const html = renderToStaticMarkup(<Icon />);
      expect(html, name).toContain('viewBox="0 0 16 16"');
      expect(html, name).toContain('stroke="currentColor"');
      expect(html, name).not.toMatch(/(fill|stroke)="#/);
    }
  });

  it("contains no emoji or unicode glyph used as an icon", () => {
    for (const [name, Icon] of Object.entries(icons)) {
      expect(renderToStaticMarkup(<Icon />), name).not.toMatch(EMOJI);
    }
  });
});
```

- [x] **Step 4: Verify**

```bash
pnpm vitest run apps/web/src/components/theme-script.test.ts packages/ui/src/icons/icons.test.ts
pnpm --filter @spektrum/web build
```

Expected: tests pass; build succeeds and the emitted HTML contains `data-theme`.

Note: `packages/ui/package.json` needs `react` and `react-dom` as dev dependencies for
`renderToStaticMarkup`, and `packages/ui/tsconfig.json` must include `jsx: "react-jsx"`.

- [x] **Step 5: Commit**

```bash
git add apps/web packages/ui
git commit -m "feat(web): tailwind v4, base typography, Prism theme bootstrap, SVG icon registry"
```

---

### Task 4: Environment validation

**Files:**
- Create: `packages/shared/src/env.ts`
- Test: `packages/shared/src/env.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `loadWebEnv(source?: NodeJS.ProcessEnv): WebEnv` and `WebEnv` type; throws a single aggregated error listing every missing/invalid variable

- [x] **Step 1: Write the failing test**

```ts
import { loadWebEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://spektrum:spektrum@localhost:5432/spektrum",
  REDIS_URL: "redis://localhost:6379",
  BETTER_AUTH_SECRET: "x".repeat(64),
  BETTER_AUTH_URL: "http://localhost:3000",
  LLM_KEY_ENCRYPTION_SECRET: "y".repeat(32),
};

it("accepts a minimal valid environment", () => {
  const env = loadWebEnv(base);
  expect(env.allowPublicSignup).toBe(false);
  expect(env.authUrl).toBe("http://localhost:3000");
});

it("rejects a BETTER_AUTH_SECRET shorter than 32 chars", () => {
  expect(() => loadWebEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
});

it("reports every problem at once", () => {
  try {
    loadWebEnv({});
  } catch (e) {
    expect((e as Error).message).toContain("DATABASE_URL");
    expect((e as Error).message).toContain("BETTER_AUTH_SECRET");
    expect((e as Error).message).toContain("LLM_KEY_ENCRYPTION_SECRET");
  }
});

it("treats only the literal string \"true\" as true", () => {
  expect(loadWebEnv({ ...base, ALLOW_PUBLIC_SIGNUP: "1" }).allowPublicSignup).toBe(false);
  expect(loadWebEnv({ ...base, ALLOW_PUBLIC_SIGNUP: "true" }).allowPublicSignup).toBe(true);
});
```

- [x] **Step 2: Run it — FAIL (module missing)**

- [x] **Step 3: Implement with zod 4**

`WebEnv` fields: `databaseUrl`, `redisUrl`, `authSecret` (from `BETTER_AUTH_SECRET`),
`authUrl` (from `BETTER_AUTH_URL`), `llmKeyEncryptionSecret`, `llmBaseUrl` (default
`https://api.kilocode.ai/v1`), `llmApiKey` optional, `llmModelChat`, `llmModelFast`,
`allowPublicSignup` (boolean, default false), `googleClientId`/`googleClientSecret`
optional, `githubClientId`/`githubClientSecret` optional, `s3Endpoint`, `s3Bucket`,
`s3AccessKey`, `s3SecretKey`, `nodeEnv`.

zod 4 notes: `error.issues` still exists, but `z.coerce.boolean()` is **not** what we
want — it stringifies truthiness, so `"1"` becomes true. Use a custom
`z.literal("true").transform(() => true).optional()`-style preprocess, or a
`z.enum(["true","false"]).transform(v => v === "true").pipe(z.boolean()).catch(false)`
for env booleans. Aggregate issues with
`error.issues.map(i => i.path.join(".") + ": " + i.message).join("\n")`.

- [x] **Step 4: Run the tests — PASS**

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/env.ts packages/shared/src/env.test.ts
git commit -m "feat(shared): fail-fast environment validation"
```

---

### Task 5: Database schema and migrations

**Files:**
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/migrate.ts`
- Create: `packages/db/vitest.setup.ts`
- Test: `packages/db/src/schema.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`
- Produces: `db` (Drizzle client), Better Auth core tables `users`, `sessions`, `accounts`, `verifications` (generated by `pnpm dlx auth@latest generate`, then hand-extended in `packages/db/src/schema.ts`) plus our tables `invites`, `admin_actions`, `projects`, `folders`, `documents`, `project_members`, `snapshots`, `pdf_renders`, `chat_threads`, `chat_messages`, `user_preferences`, `llm_usage`

- [x] **Step 1: Write the failing test**

```ts
import { afterAll, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "./client";

afterAll(async () => { await pool.end(); });

it("creates the Better Auth users table with our extra columns", async () => {
  const rows = await db.execute(sql`
    select column_name, is_nullable, data_type
    from information_schema.columns where table_name = 'users'`);
  const cols = Object.fromEntries(rows.map((r) => [r.column_name, r]));
  for (const c of ["id", "email", "email_verified", "name", "role", "banned",
                   "ban_reason", "ban_expires", "llm_api_key_ciphertext", "llm_api_key_last4"]) {
    expect(cols[c], c).toBeDefined();
  }
  expect(cols.email.data_type).toBe("citext");
  // Better Auth stores the credential password in accounts, not users
  expect(cols["password"]).toBeUndefined();
});

it("enforces one account per email regardless of case", async () => {
  await db.execute(sql`insert into users (id,email,name,email_verified) values ('u1','Dup@Example.com','D',true)`);
  await expect(
    db.execute(sql`insert into users (id,email,name,email_verified) values ('u2','dup@example.com','D',true)`)
  ).rejects.toThrow(/duplicate key/);
});

it("models bans as banned + ban_expires, and the unique index blocks a second accept", async () => {
  const cols = await db.execute(sql`
    select column_name from information_schema.columns where table_name='invites'`);
  expect(cols.map((c) => c.column_name)).toContain("accepted_user_id");
  const idx = await db.execute(sql`
    select indexdef from pg_indexes where tablename='invites' and indexname='invites_accepted_user_id_key'`);
  expect(String(idx[0].indexdef)).toMatch(/UNIQUE/);
});

it("defaults render status to queued", async () => {
  const d = await db.execute(sql`select column_default from information_schema.columns
    where table_name='pdf_renders' and column_name='status'`);
  expect(String(d[0].column_default)).toContain("queued");
});
```

- [x] **Step 2: Run it — FAIL (no tables)**

```bash
pnpm --filter @spektrum/db test
```

- [x] **Step 3: Implement the schema**

Rules:

- `citext` must be enabled by migration `CREATE EXTENSION IF NOT EXISTS citext;`.
- **Auth tables are Better Auth's, extended.** Generate them with
  `pnpm dlx auth@latest generate --config apps/web/src/auth/auth.ts -o packages/db/src/auth-schema.ts`,
  then import into `packages/db/src/schema.ts` and add our columns:
  `users.llm_api_key_ciphertext text null`, `users.llm_api_key_last4 char(4) null`.
  Configure the adapter with `usePlural: true` and
  `advanced.database.generateId: () => crypto.randomUUID()`, so ids are UUID strings in
  `text` columns. `email` is `citext("email").notNull().unique()`.
  The Admin plugin adds `users.role`, `users.banned`, `users.ban_reason`,
  `users.ban_expires` and `sessions.impersonated_by` — do not re-add them.
  Passwords live in `accounts.password` (`provider_id = 'credential'`). **No
  `users.password_hash`, no `users.status` column.**
- `invites`: `id uuid pk`, `email citext not null`, `token_hash text not null unique`,
  `created_by fk`, `expires_at not null`, `accepted_at timestamptz`,
  `accepted_user_id text fk unique`, `revoked_at`, `created_at`.
- `admin_actions`: `id uuid pk`, `actor_id fk`, `target_id fk`, `action text`,
  `reason text`, `ip inet`, `created_at`.
- `projects`, `folders`, `documents`, `project_members`, `snapshots`, `pdf_renders`,
  `chat_threads`, `chat_messages`, `user_preferences`, `llm_usage` exactly as spec §4,
  with `pdf_renders (project_id, revision_hash)` unique and `synctex_key text`.
- `documents`: unique `(project_id, path)`.
- Partial index `projects_owner_active_idx on projects(owner_id) where deleted_at is null`.

`client.ts` exports `pool` (from `postgres`) and `db` (Drizzle), both from `DATABASE_URL`.

- [x] **Step 4: Generate and apply migrations, run the test**

```bash
pnpm db:generate
DATABASE_URL=postgres://spektrum:spektrum@localhost:5432/spektrum_test pnpm db:migrate
DATABASE_URL=postgres://spektrum:spektrum@localhost:5432/spektrum_test pnpm --filter @spektrum/db test
```

Expected: 4 passing.

- [x] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): Better Auth core schema + app tables, citext emails, migrations"
```

---

### Task 6: Password hashing and policy

**Files:**
- Create: `apps/web/src/auth/password.ts`
- Test: `apps/web/src/auth/password.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(hash: string, plain: string): Promise<boolean>`, `validatePassword(plain: string): { ok: true } | { ok: false; reason: string }`

- [x] **Step 1: Write the failing test**

```ts
import { hashPassword, validatePassword, verifyPassword } from "./password";

it("round-trips a password", async () => {
  const h = await hashPassword("correct horse battery staple");
  expect(h.startsWith("$argon2id$")).toBe(true);
  await expect(verifyPassword(h, "correct horse battery staple")).resolves.toBe(true);
  await expect(verifyPassword(h, "wrong password entirely")).resolves.toBe(false);
});

it("uses the spec's argon2 parameters", async () => {
  const h = await hashPassword("another long password");
  expect(h).toMatch(/m=19456,t=2,p=1/);
});

it("rejects short passwords", () => {
  expect(validatePassword("short")).toEqual({ ok: false, reason: "At least 12 characters" });
  expect(validatePassword("twelve chars")).toEqual({ ok: true });
});

it("rejects the top common passwords even when long enough", () => {
  expect(validatePassword("passwordpassword").ok).toBe(false);
});
```

- [x] **Step 2: Run — FAIL**

- [x] **Step 3: Implement**

Use `@node-rs/argon2` `hash()` with `{ memoryCost: 19456, timeCost: 2, parallelism: 1, salt: randomBytes(16), outputLen: 32 }`.
`verifyPassword` catches malformed hashes and returns `false` (never throws).
`validatePassword` checks length ≥ 12, then membership in `packages/shared/src/common-passwords.ts`
(a 10-line seed list in this task, replaced by the full 10k list in Task 17).

These two functions are then handed to Better Auth in Task 7 as
`emailAndPassword.password = { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(hash, password) }`,
so **every** password path (sign-up, reset, change) uses Argon2id, not Better Auth's
default scrypt. Add a test that asserts the config object handed to `betterAuth()`
references these exact functions.

- [x] **Step 4: Run — PASS**

- [x] **Step 5: Commit**

```bash
git add apps/web/src/auth packages/shared/src/common-passwords.ts
git commit -m "feat(auth): argon2id hashing and password policy"
```

---

### Task 7: Better Auth wiring, session helper, request gate

**Files:**
- Create: `apps/web/src/auth/auth.ts` (the `betterAuth(...)` instance)
- Create: `apps/web/src/auth/client.ts` (`createAuthClient`)
- Create: `apps/web/src/auth/session.ts` (`assertBanState`, `requireUser`, `requireAdmin`)
- Create: `apps/web/src/auth/signup-gate.ts` (`assertSignupAllowed` + the `databaseHooks.user.create.before` wiring)
- Create: `apps/web/src/app/api/auth/[...all]/route.ts` (`toNextJsHandler(auth)`)
- Create: `apps/web/src/proxy.ts` (Next 16 name — **not** `middleware.ts`)
- Test: `apps/web/src/auth/session.test.ts`

**Interfaces:**
- Consumes: `db`, `users`, `sessions`, `hashPassword`/`verifyPassword`, env
- Produces: `auth`, `authClient`, `requireUser(): Promise<{ id, email, role }>` throwing `UnauthorizedError`/`ForbiddenError`, `requireAdmin()`, `assertBanState()` pure function

- [x] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { assertBanState } from "./session";

const now = new Date("2026-11-07T12:00:00Z");

it("accepts an unbanned user", () => {
  expect(assertBanState({ banned: false, banExpires: null }, now)).toEqual({ ok: true });
});

it("rejects a permanent ban", () => {
  expect(assertBanState({ banned: true, banExpires: null }, now))
    .toEqual({ ok: false, reason: "banned" });
});

it("rejects a suspension whose expiry has not elapsed", () => {
  expect(assertBanState({ banned: true, banExpires: new Date("2026-11-08T00:00:00Z") }, now))
    .toEqual({ ok: false, reason: "suspended", retryAfterMs: 86_400_000 });
});

it("accepts a user whose ban has expired — the ladder lifts itself", () => {
  expect(assertBanState({ banned: true, banExpires: new Date("2026-11-06T00:00:00Z") }, now))
    .toEqual({ ok: true });
});
```

- [x] **Step 2: Run — FAIL**

- [x] **Step 3: Implement**

`auth.ts` — the single Better Auth instance:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { admin } from "better-auth/plugins";
import { db } from "@spektrum/db";
import * as schema from "@spektrum/db/schema";
import { hashPassword, verifyPassword } from "./password";
import { signupGateHooks } from "./signup-gate";
import { env } from "@spektrum/shared/env";

export const auth = betterAuth({
  baseURL: env.authUrl,
  secret: env.authSecret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  advanced: {
    database: { generateId: () => crypto.randomUUID() },
    defaultCookieAttributes: { httpOnly: true, secure: env.nodeEnv === "production", sameSite: "lax" },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    password: {
      hash: hashPassword,
      verify: ({ hash, password }) => verifyPassword(hash, password),
    },
  },
  session: {
    expiresIn: 30 * 24 * 60 * 60,   // 30 days
    updateAge: 24 * 60 * 60,         // rolling refresh daily
    cookieCache: { enabled: false }, // bans must be visible on the next request
  },
  plugins: [admin({ defaultRole: "member", adminRoles: ["owner", "admin"] })],
  databaseHooks: signupGateHooks,
});
```

`session.ts` exports the pure `assertBanState` (tested above) plus:

```ts
export async function requireUser(): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new UnauthorizedError();
  const state = assertBanState(
    { banned: session.user.banned, banExpires: session.user.banExpires }, new Date());
  if (!state.ok) {
    await auth.api.revokeUserSessions({ body: { userId: session.user.id } });
    throw new ForbiddenError(state.reason, state.retryAfterMs);
  }
  return { id: session.user.id, email: session.user.email, role: session.user.role };
}
export async function requireAdmin() { const u = await requireUser(); if (!["owner","admin"].includes(u.role)) throw new ForbiddenError("admin"); return u; }
```

`signup-gate.ts` exports `assertSignupAllowed({ email, allowBootstrap })` — allows when
`ALLOW_PUBLIC_SIGNUP=true`, when an unconsumed invite exists for the email, or when
`allowBootstrap` is set by the owner CLI — and the `databaseHooks.user.create.before`
hook that calls it and throws `APIError("FORBIDDEN", { message: "invite_required" })`.

`app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/auth/auth";
export const { GET, POST } = toNextJsHandler(auth);
```

`proxy.ts` (Next 16 — deprecated `middleware.ts` must not be used) protects `/(app)` and
`/api/` except `/api/auth/*` and `/api/health`. It only checks **cookie presence**
(fast path); the real check is `requireUser()` in the route/RSC.

- [x] **Step 4: Run — PASS, then a manual check**

```bash
pnpm --filter @spektrum/web dev
curl -i -X POST http://localhost:3000/api/auth/sign-in/email -H 'content-type: application/json' -d '{}'
```

Expected: `4xx`, never a `set-cookie` session header. (A scripted happy-path login arrives in Task 9.)

- [x] **Step 5: Commit**

```bash
git add apps/web/src/auth apps/web/src/proxy.ts apps/web/src/app/api/auth
git commit -m "feat(auth): Better Auth sessions, ban-state check, signup gate, proxy.ts"
```

---

### Task 8: CSRF and same-origin guard

**Files:**
- Create: `packages/shared/src/http/guard.ts`
- Test: `packages/shared/src/http/guard.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `assertSameOrigin(req: Request, expectedOrigin: string): void` (throws `CsrfError`), `issueCsrfCookie(): { token: string; setCookie: string }`, `verifyCsrf(req: Request, cookieToken?: string): boolean`

- [x] **Step 1: Write the failing test**

```ts
import { assertSameOrigin } from "./guard";

const req = (headers: Record<string, string>) => new Request("https://spektrum.app/api/x", { method: "POST", headers });

it("accepts a matching Origin", () => {
  expect(() => assertSameOrigin(req({ origin: "https://spektrum.app" }), "https://spektrum.app")).not.toThrow();
});

it("rejects a foreign Origin", () => {
  expect(() => assertSameOrigin(req({ origin: "https://evil.example" }), "https://spektrum.app")).toThrow(/origin/i);
});

it("rejects a missing Origin on a mutation", () => {
  expect(() => assertSameOrigin(req({}), "https://spektrum.app")).toThrow(/origin/i);
});

it("ignores Origin on GET", () => {
  const get = new Request("https://spektrum.app/api/x", { method: "GET", headers: { origin: "https://evil.example" } });
  expect(() => assertSameOrigin(get, "https://spektrum.app")).not.toThrow();
});
```

- [x] **Step 2: Run — FAIL**

- [x] **Step 3: Implement**

Compare `new URL(origin).origin` with `expectedOrigin` after normalising case and
trailing slash. Methods `GET`, `HEAD`, `OPTIONS` bypass. `verifyCsrf` is a constant-time
comparison of the `x-csrf-token` header with the `spektrum.csrf` cookie value.

Note: Better Auth already validates `Origin` on its own `/api/auth/*` endpoints, so this
guard is for **our** mutating routes only — do not wrap `/api/auth/*`.

- [x] **Step 4: Run — PASS**

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/http
git commit -m "feat(security): same-origin and CSRF guards"
```

---

### Task 9: Login page and credentials sign-in end to end

**Files:**
- Create: `apps/web/src/app/login/page.tsx` (client component using `authClient`)
- Create: `apps/web/src/app/(app)/page.tsx`
- Test: `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `authClient`, `requireUser`
- Produces: `/login` renders with the spec's field labels; successful sign-in redirects to `/`

- [x] **Step 1: Write the failing E2E test**

```ts
import { expect, test } from "@playwright/test";

test("owner signs in and lands on the dashboard shell", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.getByLabel("Email").fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Your Projects")).toBeVisible();
});

test("wrong password keeps the user on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel("Password").fill("definitely not it");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("alert")).toHaveText("Incorrect email or password.");
});
```

- [x] **Step 2: Run — FAIL (no /login)**

- [x] **Step 3: Implement**

The login page uses the tokens: `--bg-app` canvas, a centred `--modal-bg` card,
`--radius-2xl`, title `Sign in`, fields labelled `Email` and `Password`, primary
button `Sign in`, and a secondary `Continue with Google` only when
`GOOGLE_CLIENT_ID` is set. Error text is exactly `Incorrect email or password.` for any
credential failure (no user enumeration). The client calls
`authClient.signIn.email({ email, password, callbackURL: "/" })`; the server never sees
the password. The Google button calls
`authClient.signIn.social({ provider: "google" })`.

`(app)/page.tsx` calls `requireUser()` and renders a temporary `<h1>Your Projects</h1>`
(a real dashboard arrives in plan 01). Note Next 16: the page component is `async` and
any `params`/`searchParams` are awaited.

- [x] **Step 4: Run — PASS**

```bash
pnpm exec playwright test e2e/auth.spec.ts
```

- [x] **Step 5: Commit**

```bash
git add apps/web/src/app e2e
git commit -m "feat(auth): login page and credentials sign-in"
```

---

### Task 10: Owner bootstrap CLI

**Files:**
- Create: `apps/web/src/cli/create-owner.ts`
- Modify: `apps/web/package.json` (`"admin:create-owner": "tsx src/cli/create-owner.ts"`)
- Test: `apps/web/src/cli/create-owner.test.ts`

**Interfaces:**
- Consumes: `auth.api`, `hashPassword`, `db`, `users`
- Produces: `createOwner({ email, password, name }): Promise<{ id: string }>`; CLI exits 1 when an owner already exists or the password is rejected

- [x] **Step 1: Write the failing test**

```ts
it("creates the first owner", async () => {
  const { id } = await createOwner({ email: "owner@example.com", password: "a long enough password", name: "Owner" });
  const row = await findUserById(id);
  expect(row?.role).toBe("owner");
  const acct = await findCredentialAccount(id);
  expect(acct?.password).toMatch(/^\$argon2id\$/);   // hashed by Task 6's functions
});

it("refuses a second owner", async () => {
  await expect(createOwner({ email: "second@example.com", password: "another long password", name: "X" }))
    .rejects.toThrow(/owner already exists/i);
});

it("refuses a weak password", async () => {
  await expect(createOwner({ email: "weak@example.com", password: "short", name: "X" }))
    .rejects.toThrow(/at least 12/i);
});
```

- [x] **Step 2: Run — FAIL**

- [x] **Step 3: Implement**

`createOwner` runs in a transaction: `select count(*) from users where role = 'owner' for update`,
then calls `auth.api.createUser` with `allowBootstrap` context (the signup-gate escape
hatch) and `role: "owner"`, `emailVerified: true`. The credential password is hashed by
the Task 6 Argon2id functions. The CLI reads `--email`, `--name` and prompts for the
password twice with hidden input; it prints `Owner created: <email>` and nothing else
(no hashes, no ids beyond a UUID prefix).

- [x] **Step 4: Run — PASS, then bootstrap the dev database**

```bash
pnpm --filter @spektrum/web admin:create-owner --email owner@spektrum.local --name "Keyhayn"
```

- [x] **Step 5: Commit**

```bash
git add apps/web/src/cli apps/web/package.json
git commit -m "feat(auth): owner bootstrap CLI"
```

---

### Task 11: Invites

**Files:**
- Create: `apps/web/src/auth/invites.ts`
- Create: `apps/web/src/app/api/admin/invites/route.ts`
- Create: `apps/web/src/app/invite/[token]/page.tsx`
- Test: `apps/web/src/auth/invites.test.ts`
- Test: `apps/web/src/auth/invites.concurrent.test.ts`

**Interfaces:**
- Consumes: `db`, `invites`, `users`, `auth.api`, `validatePassword`, `requireAdmin`, `assertSignupAllowed`
- Produces: `createInvite({ email, actorId }): Promise<{ token: string }>`, `redeemInvite({ token, password, name }): Promise<{ userId: string }>`, `revokeInvite(id)`, `listInvites()`

- [x] **Step 1: Write the failing tests**

```ts
it("creates an invite bound to a normalised email", async () => {
  const { token } = await createInvite({ email: "  New.User@Example.COM ", actorId: ownerId });
  const rows = await listInvites();
  expect(rows[0].email).toBe("new.user@example.com");
  expect(token).toHaveLength(43);            // 32 random bytes, base64url
});

it("stores only a hash of the token", async () => {
  const { token } = await createInvite({ email: "a@b.com", actorId: ownerId });
  const raw = await db.execute(sql`select token_hash from invites where email='a@b.com'`);
  expect(raw[0].token_hash).not.toBe(token);
});

it("redeems once and creates a member", async () => {
  const { token } = await createInvite({ email: "c@d.com", actorId: ownerId });
  const { userId } = await redeemInvite({ token, password: "a long enough password", name: "C" });
  const u = await findUserById(userId);
  expect(u?.role).toBe("member");
  expect(u?.banned).toBe(false);
  await expect(redeemInvite({ token, password: "another long password", name: "C" }))
    .rejects.toThrow(/already used|no longer valid/i);
});

it("allows exactly one of two concurrent redemptions", async () => {
  const { token } = await createInvite({ email: "race@example.com", actorId: ownerId });
  const results = await Promise.allSettled([
    redeemInvite({ token, password: "a long enough password", name: "A" }),
    redeemInvite({ token, password: "a long enough password", name: "B" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const count = await db.execute(sql`select count(*)::int c from users where email='race@example.com'`);
  expect(count[0].c).toBe(1);
});

it("rejects an expired invite", async () => {
  const { token } = await createInvite({ email: "late@example.com", actorId: ownerId, ttlMs: -1000 });
  await expect(redeemInvite({ token, password: "a long enough password", name: "L" }))
    .rejects.toThrow(/expired/i);
});
```

- [x] **Step 2: Run — FAIL**

- [x] **Step 3: Implement**

`redeemInvite` runs in a transaction:

```sql
UPDATE invites SET accepted_at = now(), accepted_user_id = $userId
WHERE token_hash = $hash AND accepted_at IS NULL AND revoked_at IS NULL
  AND expires_at > now()
RETURNING id;
```

Zero rows → throw `This invite is no longer valid.` Otherwise create the user through
`auth.api.createUser` (or `signUpEmail`) with the invite email, so the signup gate
(`assertSignupAllowed`) sees a matching unconsumed invite; `validatePassword` runs first.
The `accepted_user_id` unique index is the race backstop: two concurrent redemptions
cannot both succeed (exactly one `UPDATE ... RETURNING` returns a row).
`createInvite` writes `expires_at = now + 7 days` and stores `sha256(token)`.

`POST /api/admin/invites` requires `requireAdmin`, calls `assertSameOrigin`, validates
`{ email }` with zod, and returns `{ token, url }` where `url` is
`${BETTER_AUTH_URL}/invite/${token}`. The page at `/invite/[token]` shows the bound email, two
password fields, and the button `Create account`.

- [x] **Step 4: Run — PASS (including the concurrency test)**

- [x] **Step 5: Commit**

```bash
git add apps/web/src/auth/invites* apps/web/src/app/api/admin apps/web/src/app/invite
git commit -m "feat(auth): invite-only registration"
```

---

### Task 12: Ban and suspension enforcement

**Files:**
- Create: `apps/web/src/auth/admin.ts`
- Create: `apps/web/src/app/api/admin/users/[id]/status/route.ts`
- Test: `apps/web/src/auth/admin.test.ts`

**Interfaces:**
- Consumes: `auth.api` (admin plugin), `db`, `users`, `sessions`, `adminActions`, `requireAdmin`
- Produces: `suspendUser({ actorId, userId, until, reason })` = `banUser` with `banExpiresIn`; `banUser({ actorId, userId, reason })` = permanent; `unbanUser({ actorId, userId })`; audit row per action

- [x] **Step 1: Write the failing test**

```ts
it("a permanent ban revokes every live session", async () => {
  const uid = await makeUser("victim@example.com");
  await makeSession(uid);
  await banUser({ actorId: ownerId, userId: uid, reason: "abuse" });
  const left = await db.select().from(sessions).where(eq(sessions.userId, uid));
  expect(left).toHaveLength(0);
  const u = await findUserById(uid);
  expect(u?.banned).toBe(true);
  expect(u?.banExpires).toBeNull();          // permanent
  expect(u?.banReason).toBe("abuse");
});

it("a banned user's existing cookie stops working immediately", async () => {
  const { sessionId } = await makeSession(victimId);
  await banUser({ actorId: ownerId, userId: victimId, reason: "abuse" });
  await expect(requireUserForSession(sessionId)).rejects.toThrow(/banned|forbidden/i);
});

it("suspension carries an expiry and lifts itself", async () => {
  const uid = await makeUser("temp@example.com");
  await suspendUser({ actorId: ownerId, userId: uid, until: inHours(-1), reason: "spam" });
  expect(assertBanState(await banColumnsOf(uid), new Date())).toEqual({ ok: true });
  await suspendUser({ actorId: ownerId, userId: uid, until: inHours(1), reason: "spam" });
  expect(assertBanState(await banColumnsOf(uid), new Date()).ok).toBe(false);
});

it("writes an audit row for every action", async () => {
  const rows = await db.select().from(adminActions);
  expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["ban", "suspend", "unban"]));
});
```

- [x] **Step 2: Run — FAIL**

- [x] **Step 3: Implement**

All three wrap the Admin plugin's `auth.api.banUser` / `auth.api.unbanUser` (ban with
`banExpiresIn` for suspension, no `banExpiresIn` for permanent) and write an
`admin_actions` row in the same transaction. The plugin revokes the user's sessions on
ban; `requireUser()` (Task 7) re-checks `banned`/`ban_expires` on every request, which is
what makes a pre-ban cookie die on the next request.

- [x] **Step 4: Run — PASS**

- [x] **Step 5: Commit**

```bash
git add apps/web/src/auth/admin.ts apps/web/src/app/api/admin
git commit -m "feat(security): ban ladder with session revocation and audit"
```

---

### Task 13: Google OAuth through Better Auth

**Files:**
- Modify: `apps/web/src/auth/auth.ts` (add `socialProviders.google`)
- Create: `apps/web/src/auth/oauth-gate.test.ts`

**Interfaces:**
- Consumes: `socialProviders`, `signup-gate`, `invites`
- Produces: Google sign-in that links to an existing account by verified email, creates a member only for invited emails, and refuses everyone else while signup is closed

- [x] **Step 1: Write the failing tests**

```ts
it("rejects an unverified provider email", async () => {
  // user.validateUserInfo returns an error when emailVerified is false
  await expect(googleCallback({ email: "x@y.com", emailVerified: false, sub: "1" }))
    .rejects.toThrow(/verified/i);
});

it("links to an existing account instead of creating a duplicate", async () => {
  const existing = await makeUser("linked@example.com");
  const { userId, linked } = await googleCallback({
    email: "LINKED@example.com", emailVerified: true, sub: "42" });
  expect(userId).toBe(existing);
  expect(linked).toBe(true);
});

it("creates a member when signup is closed but the email was invited", async () => {
  await createInvite({ email: "invited@example.com", actorId: ownerId });
  const { userId } = await googleCallbackWithInvite({
    email: "invited@example.com", emailVerified: true, sub: "7", requestSignUp: true });
  expect((await findUserById(userId))?.role).toBe("member");
});

it("creates nothing when signup is closed and no invite exists", async () => {
  await expect(googleCallback({ email: "stranger@example.com", emailVerified: true, sub: "8" }))
    .rejects.toThrow(/invite_required|signup_disabled/i);
  expect(await countUsersWithEmail("stranger@example.com")).toBe(0);
});

it("creates a member when ALLOW_PUBLIC_SIGNUP=true", async () => {
  // env flag flipped in the test env
  const { userId } = await googleCallback({ email: "anyone@example.com", emailVerified: true, sub: "9" });
  expect(userId).toBeTruthy();
});
```

- [x] **Step 2: Run — FAIL**

- [x] **Step 3: Implement**

Add to `auth.ts`:

```ts
socialProviders: {
  google: {
    clientId: env.googleClientId!,
    clientSecret: env.googleClientSecret!,
    scope: ["openid", "email", "profile"],
    disableImplicitSignUp: true,          // strangers get ?error=signup_disabled
  },
},
user: {
  validateUserInfo: ({ user }) => {
    if (!user.emailVerified) return { error: "email_not_verified" };
  },
},
```

The invite page calls `authClient.signIn.social({ provider: "google", requestSignUp: true })`
after the invite token is validated server-side; the `databaseHooks.user.create.before`
gate (Task 7) is the backstop that rejects any other creation. GitHub is added the same
way, gated on `GITHUB_CLIENT_ID`, and is not rendered in the UI until credentials exist.

- [x] **Step 4: Run — PASS**

- [x] **Step 5: Commit**

```bash
git add apps/web/src/auth
git commit -m "feat(auth): google oauth with invite-aware linking via Better Auth"
```

---

### Task 14: BYOK key storage

**Files:**
- Create: `packages/shared/src/crypto/envelope.ts`
- Create: `apps/web/src/app/api/user/llm-key/route.ts`
- Test: `packages/shared/src/crypto/envelope.test.ts`
- Test: `apps/web/src/app/api/user/llm-key/route.test.ts`

**Interfaces:**
- Consumes: `LLM_KEY_ENCRYPTION_SECRET`
- Produces: `sealSecret(plain, aad): string`, `openSecret(sealed, aad): string`, `last4(plain): string`; `PUT/DELETE /api/user/llm-key`, `GET` returns `{ configured: boolean, last4?: string }`

- [ ] **Step 1: Write the failing tests**

```ts
const KEY = Buffer.alloc(32, 7);
const AAD = "user:6f1c…";

it("round-trips", () => {
  const sealed = sealSecret("sk-live-abcdef123456", AAD, KEY);
  expect(sealed).not.toContain("sk-live");
  expect(openSecret(sealed, AAD, KEY)).toBe("sk-live-abcdef123456");
});

it("fails when the AAD changes (key bound to a user)", () => {
  const sealed = sealSecret("sk-live-abcdef123456", AAD, KEY);
  expect(() => openSecret(sealed, "user:other", KEY)).toThrow();
});

it("fails when the ciphertext is tampered with", () => {
  const sealed = sealSecret("sk-live-abcdef123456", AAD, KEY);
  const bytes = Buffer.from(sealed, "base64");
  bytes[bytes.length - 1] ^= 0xff;
  expect(() => openSecret(bytes.toString("base64"), AAD, KEY)).toThrow();
});
```

Route tests assert: `GET` never returns the secret; `PUT` with a bad key shape returns
400; the response body of every method does not contain the string that was stored.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

AES-256-GCM, 12-byte random nonce, 16-byte tag, `base64(nonce || tag || ciphertext)`.
`PUT` body `{ apiKey: string }` validated `min(20).max(200)`, stores ciphertext +
`last4`. `GET` returns `{ configured, last4 }` only. `DELETE` nulls both columns.
Add a request-scoped logger redaction rule: any value matching `/^sk-[A-Za-z0-9_-]{8,}$/`
is replaced with `sk-***` before logging.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/crypto apps/web/src/app/api/user
git commit -m "feat(security): envelope-encrypted BYOK keys with redaction"
```

---

### Task 15: Redis rate limiting

**Files:**
- Create: `packages/shared/src/rate-limit.ts`
- Test: `packages/shared/src/rate-limit.test.ts`
- Test: `apps/web/src/auth/login-rate-limit.test.ts`

**Interfaces:**
- Consumes: `REDIS_URL`
- Produces: `consume(key: string, budget: Budget): Promise<{ allowed: boolean; retryAfterMs: number }>` where `Budget = { limit: number; windowMs: number; burst?: number }`; exported `BUDGETS` map with the spec's values

- [ ] **Step 1: Write the failing test**

```ts
it("allows up to the limit then blocks with a retry hint", async () => {
  const k = `t:${randomUUID()}`;
  for (let i = 0; i < 5; i++) expect((await consume(k, BUDGETS.signIn)).allowed).toBe(true);
  const blocked = await consume(k, BUDGETS.signIn);
  expect(blocked.allowed).toBe(false);
  expect(blocked.retryAfterMs).toBeGreaterThan(0);
});

it("defines the spec's budgets", () => {
  expect(BUDGETS.signIn).toEqual({ limit: 5, windowMs: 15 * 60_000 });
  expect(BUDGETS.compile).toEqual({ limit: 6, windowMs: 60_000, burst: 12 });
  expect(BUDGETS.ai).toEqual({ limit: 30, windowMs: 60_000 });
  expect(BUDGETS.upload).toEqual({ limit: 20, windowMs: 60_000 });
});
```

Plus a login test: six wrong passwords in a row produce the fifth-attempt generic error
and then `429` with `Retry-After`.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Sliding-window counter with a single Lua script (`INCR` + `PEXPIRE` on first hit, plus a
bucket key per window) so the check is atomic across instances.

Scope note: this limiter covers **our** routes (compile, AI, upload). Better Auth's own
`/api/auth/*` endpoints are limited by its built-in `rateLimit` config, pointed at Redis
via `secondaryStorage` in Task 7 — do not double-count them here.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/rate-limit.ts packages/shared/src/rate-limit.test.ts apps/web/src/auth/login-rate-limit.test.ts
git commit -m "feat(security): redis rate limiting with spec budgets"
```

---

### Task 16: Development environment in Docker Compose

**Files:**
- Create: `docker/compose.dev.yml`
- Create: `.env.example`
- Create: `scripts/dev-db.sh`
- Test: manual smoke (documented below)

**Interfaces:**
- Consumes: nothing
- Produces: `pnpm dev:infra` up → Postgres 16 on 5432, Redis 7 on 6379, MinIO on 9000/9001; `spektrum` and `spektrum_test` databases exist

- [ ] **Step 1: Write `compose.dev.yml`**

Services: `postgres:16-alpine` (POSTGRES_USER/PASSWORD/DB=`spektrum`), `redis:7-alpine`,
`minio/minio` with `server /data --console-address ":9001"`, and a one-shot
`createbuckets` using `minio/mc`. Volumes named; ports published to localhost only.
Health checks on all three.

- [ ] **Step 2: Add the test database bootstrap**

`scripts/dev-db.sh` runs `CREATE DATABASE spektrum_test` if absent (idempotent), plus
`CREATE EXTENSION citext` in both.

- [ ] **Step 3: Run it**

```bash
docker compose -f docker/compose.dev.yml up -d
./scripts/dev-db.sh
docker compose -f docker/compose.dev.yml ps
```

Expected: four services `running`/`healthy`; `psql` to 5432 succeeds with the dev credentials.

- [ ] **Step 4: Prove the app connects**

```bash
cp .env.example .env.local
pnpm db:migrate
pnpm --filter @spektrum/web dev &
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
```

Expected: `200`.

- [ ] **Step 5: Commit**

```bash
git add docker scripts .env.example
git commit -m "chore(dev): docker compose for postgres, redis, minio"
```

---

### Task 17: CI, and the full common-password list

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `packages/shared/src/common-passwords.ts` (replace the seed with the real 10k list, sorted, lowercased)
- Modify: `package.json` (`"test:e2e"`)

**Interfaces:**
- Consumes: everything above
- Produces: CI runs typecheck, unit tests, build, and Playwright against ephemeral Postgres/Redis

- [ ] **Step 1: Write the workflow**

Jobs: `typecheck` (`pnpm install --frozen-lockfile && pnpm typecheck`), `unit`
(services postgres 16 + redis 7, `pnpm db:migrate` against `spektrum_test`, `pnpm test`),
`e2e` (build, start, `pnpm test:e2e` with `E2E_OWNER_EMAIL`/`PASSWORD` seeded by
`scripts/ci-seed.ts`). Node comes from `.node-version` via `actions/setup-node` with
`node-version-file: .node-version` (not a hardcoded 22); pnpm from
`packageManager` via `pnpm/action-setup`. Cache the pnpm store. `next build` no longer
lints in Next 16, so lint is a separate `lint` job (`eslint .`). Fail on any `tsc` error.

- [ ] **Step 2: Run the full suite locally**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: all green. This is the Phase 0 gate.

- [ ] **Step 3: Verify the closed-signup posture manually**

```bash
curl -s -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"stranger@example.com","password":"a long enough password","name":"S"}' | head -c 200
```

Expected: `403` with `invite_required` (the signup gate), and **no user row** created.
`GET /login` shows no "Create account" link.

- [ ] **Step 4: Commit**

```bash
git add .github packages/shared/src/common-passwords.ts package.json
git commit -m "chore(ci): full pipeline and password list"
```

---

## Phase 0 exit checklist

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass, on Node 26.13.0 / pnpm 12.18.0 from the repo pins.
- [ ] `docker compose -f docker/compose.dev.yml ps` shows healthy Postgres, Redis, MinIO.
- [ ] Owner exists via CLI; owner can sign in; wrong password shows the generic error.
- [ ] A direct `POST /api/auth/sign-up/email` from a stranger returns `403 invite_required` and creates no row.
- [ ] An invite can be created, redeemed once, and never twice (including concurrently).
- [ ] Banning a user kills their session on the next request; suspension expires by itself.
- [ ] A stored BYOK key never appears in any response or log.
- [ ] Six failed logins produce `429` with `Retry-After`.
- [ ] `GET /login` in both themes renders Crixet Sans (check the computed font family).
- [ ] Design-token test passes; no component contains a hex literal.
- [ ] No emoji in the rendered DOM; every `<svg>` has `viewBox="0 0 16 16"` and uses `currentColor` only.
- [ ] No file named `middleware.ts` exists; the gate is `proxy.ts`.
