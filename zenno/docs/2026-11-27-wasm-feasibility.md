# WASM TeX engine feasibility spike

Status: decision record — Task 1 gate for the free-serverless deployment
Date: 2026-11-27
Branch: `free-serverless-deploy`
Scope: research/documentation only. No product code changed.

## TL;DR

**viable: true**

A browser-side TeX engine that loads from an external CDN under the existing CSP
(plus two small directive additions) exists and is production-shaped: **Siglum
`@siglum/engine`** (MIT, BusyTeX/TeX Live 2026, SyncTeX, CORS-enabled CDN). The
three engines named in the brief (BusyTeX, SwiftLaTeX, `wasmtex`) are **not**
viable as external-CDN assets, but the Siglum engine is a BusyTeX-family engine
that fixes exactly the gap (CORS + a real package server) that sinks the others.
The design's §6 "browser WASM from an external CDN, nothing vendored" decision
therefore holds, with Siglum as the concrete pick.

## Method

`curl` and `npm view`/`npm pack` only, from a clean temp dir. No repo files were
modified during probing. Each engine's published tarball was unpacked and its
runtime source read to find the real asset origins, package-server endpoints and
SyncTeX handling (the marketing READMEs are not sufficient — the npm packages
themselves contain no WASM). CORS was tested by sending
`Origin: https://spektrum.vercel.app` and inspecting
`access-control-allow-origin` on the final (post-redirect) response.

## CSP baseline (apps/web/next.config.ts:34-40)

```
default-src 'self'
script-src  'self' 'unsafe-inline' 'unsafe-eval'
worker-src  'self' blob:
style-src   'self' 'unsafe-inline'
img-src     'self' data: blob:
font-src    'self' data:
connect-src 'self'
```

Relevant facts established during probing:

- A dedicated Worker's `importScripts()` is governed by **`script-src`** (the
  worker inherits the document CSP), not `worker-src`. `worker-src` only governs
  the `new Worker(url)` load itself.
- Siglum builds its Worker from a **blob URL** (`worker-src blob:` already
  allows this) and loads the cross-origin `busytex.js` by `fetch` → `Blob` →
  `importScripts(blob:)`, specifically to sidestep `importScripts`'s stricter
  CORS. That means `script-src` needs `blob:` added.
- All runtime/package fetches (wasm, js, bundles, `.tar.xz`) go through `fetch`,
  governed by **`connect-src`**, which needs the CDN origin added.
- No engine requires `SharedArrayBuffer`, COOP or COEP. Siglum explicitly avoids
  SAB (V8 memory-leak notes in source); wasmtex's design rules SAB out. So no
  cross-origin-isolation headers are needed.

### Required CSP delta

| Directive | Current | Needed | Why |
|---|---|---|---|
| `connect-src` | `'self'` | `'self' https://packages.siglum.org` | fetch wasm/js/bundles/package archives |
| `script-src` | `'self' 'unsafe-inline' 'unsafe-eval'` | add `blob:` | worker `importScripts(blob:)` of fetched `busytex.js` |
| `worker-src` | `'self' blob:` | unchanged | Worker is created from a blob URL |

No other directive changes. `font-src`/`img-src` are unaffected (the engine
renders no DOM fonts/images itself; the PDF viewer is already same-origin).

## Candidate results

### 1. BusyTeX — `texlyre-busytex@1.4.1` — NOT viable (as external CDN)

- npm tarball: JS only, 156,994 B unpacked / 49 files. **No WASM in the package.**
- Assets: GitHub Release `assets-v1.4.1/busytex-assets.tar.gz` = **497.58 MB**
  (521,748,902 B; wasm ~32 MB + TeX Live data 90–400 MB).
- Cross-origin: **FAILS.** Release assets 302-redirect to
  `release-assets.githubusercontent.com`; the final 200/206 response carries
  **no `access-control-allow-origin`** even with a Range request. A browser
  `fetch()` from `spektrum.vercel.app` is blocked. jsDelivr can serve the repo
  tree but not release binaries (the wasm is not in git).
- Package server: only an optional `remoteEndpoint` compile option; the public
  `texlyre.org` endpoints 302-redirect and `api.texlyre.org` does not resolve.
  No stable, CORS-enabled on-demand package server.
- License: **AGPL-3.0-or-later**.
- SyncTeX: **yes** (`CompileResult.synctex?: Uint8Array`).
- Verdict: would require self-hosting ~500 MB (violates "nothing vendored" and
  free-tier storage), and has no CORS package server. **viable: false.**

### 2. SwiftLaTeX — NOT viable

- npm: **not published** (`swiftlatex`, `swiftlatex-wasm`, `-pdftex`, `-xetex`,
  `-luatex`, `-engine` all 404).
- GitHub `SwiftLaTeX/SwiftLaTeX`: AGPL-3.0, last push **2024-06-18**, not
  archived but stale. Releases are ~2 MB **editor** zips (v20022022), not an
  embeddable engine SDK or WASM asset set.
- It is a WYSIWYG editor application, not a consumable compile library/CDN.
- License: **AGPL-3.0**. SyncTeX: editor feature, but no library surface.
- Verdict: nothing to load from a CDN as an engine. **viable: false.**

### 3. `wasmtex@0.1.1` — NOT viable

- npm tarball: JS only, 572,848 B unpacked / 45 files. **No WASM in the package.**
- Assets: GitHub Release `assets-v0.1.1` —
  `wasmtex-assets-0.1.1.tar.gz` = **414.92 MB**,
  `wasmtex-bundle-core-0.1.1.tar.gz` = **35.83 MB**,
  `wasmtex-bundle-academic-0.1.1.tar.gz` = **363.32 MB**.
- Cross-origin: **FAILS.** Same as BusyTeX — GitHub release assets carry no
  `access-control-allow-origin` (verified 200/206 with `Origin`).
- Package server: **none.** Tiers are prebuilt `core`/`academic` bundles loaded
  from `assetsBaseUrl`; "no network after asset load". No on-demand package API.
- License: **MIT**.
- SyncTeX: **NO.** Source is explicit: requested SyncTeX is "not yet implemented
  in this build; continuing without it" (advisory logged). Pre-1.0, LuaTeX
  reserved/unimplemented.
- Verdict: no CORS, no SyncTeX, no package server. **viable: false.**

### 4. Siglum — `@siglum/engine@0.2.2` — VIABLE (the pick)

- npm tarball: JS only, 320,137 B unpacked / 26 files. Runtime is fetched from a
  CORS-enabled CDN at init (the JS is the loader).
- Runtime origin: **`https://packages.siglum.org`** (Cloudflare). Pointer
  `GET /engines/0.2.2/latest.json` → release `tl2026-0cc2592f50103429`.
- Cross-origin: **WORKS.** `access-control-allow-origin: *` on the pointer, the
  manifest, `wasm/busytex.wasm` (`content-type: application/wasm`, 30.79 MB),
  `wasm/busytex.js`, `xzwasm.js`, bundle files, and the package API.
- Sizes: runtime manifest = 128 files / **302.48 MB** total, but **bundles are
  on-demand** (37 bundles / 167.90 MiB; e.g. `core` 4.33 MiB, `fmt-xelatex`
  4.28 MiB, `amsmath` 0.51 MiB, `cm-super` 57.16 MiB only if needed). First load is
  wasm (30.79 MB) + `core` + the format for the chosen engine.
- Package server: **`https://packages.siglum.org/api/texlive/<pkg>`** returns
  `application/x-xz` (`.tar.xz`) with `access-control-allow-origin: *`; CTAN
  proxy fallback under the same origin. Real on-demand package fetch + OPFS/IDB
  caching.
- License: **MIT** (`@siglum/engine`, Copyright 2026 Siglum Project).
- SyncTeX: **yes** — compiles with `--synctex=-1`, reads `<doc>.synctex` back.
- No SAB / no COOP/COEP required.
- Worker: created from a blob URL; `busytex.js` fetched cross-origin → blob →
  `importScripts`. Compatible with the CSP delta above.
- Verdict: **viable: true.**

## EnginePick

```
EnginePick = {
  name:          "@siglum/engine (Siglum; BusyTeX / TeX Live 2026)",
  assetOrigin:   "https://packages.siglum.org",
  packageOrigin: "https://packages.siglum.org/api/texlive (TeX Live/CTAN proxy)",
  license:       "MIT",
  synctex:       true,
  viable:        true,
}
```

### Full comparison

| Engine | Package | Asset origin | Asset size | Cross-origin | Package server | License | SyncTeX | Viable |
|---|---|---|---|---|---|---|---|---|
| BusyTeX | `texlyre-busytex@1.4.1` | GitHub Releases | 497.58 MB | no CORS | none stable | AGPL-3.0-or-later | yes | false |
| SwiftLaTeX | not on npm | GitHub (editor zips) | ~2 MB editor | n/a | n/a | AGPL-3.0 | editor only | false |
| wasmtex | `wasmtex@0.1.1` | GitHub Releases | 414.92 MB | no CORS | none (prebuilt tiers) | MIT | no | false |
| **Siglum** | **`@siglum/engine@0.2.2`** | **`packages.siglum.org`** | **30.79 MB wasm + on-demand** | **yes (`*`)** | **yes (`/api/texlive`)** | **MIT** | **yes** | **true** |

## Why Siglum satisfies the design constraints

- **§6 "external CDN, nothing vendored":** assets are loaded from
  `packages.siglum.org`; no AGPL code is vendored or modified in this repo
  (Siglum is MIT, and even the BusyTeX base is only fetched, never committed).
- **§3 free-tier / no local FS:** no server compute; the ~30 MB wasm + on-demand
  bundles are browser-cached (OPFS/IndexedDB). Nothing large is stored on Vercel.
- **§6 SyncTeX + PDF/log to R2:** SyncTeX is produced; the existing plan to
  upload PDF/log/SyncTeX via signed R2 URLs is unchanged.
- **CSP:** only `connect-src` (+`https://packages.siglum.org`) and `script-src`
  (+`blob:`) need extending; `worker-src` already allows blob workers.

## Risks / notes for the builder

- **Availability of a third-party CDN.** The whole compile path depends on
  `packages.siglum.org` staying up and CORS-open. The design's Alternative B
  (PDF-viewer-only fallback) remains the graceful degradation if it is down.
- **First-load weight.** ~30 MB wasm plus the engine format and `core` bundle;
  acceptable per design §6/§11 but worth a loading indicator.
- **Package coverage** is TeX Live 2026 via the proxy, not full TeX Live parity;
  BibTeX/biber and exotic packages may need the fallback.
- **Version pinning.** Pin `@siglum/engine` exactly and re-run this probe on
  upgrade; the runtime `releaseId` is content-hashed and must match the SDK.
- **CSP `blob:` in `script-src`** slightly widens script sources; it is required
  by Siglum's cross-origin loader and is low risk (blob URLs are same-origin
  documents created by our own code).
- **AGPL note:** BusyTeX proper is AGPL; Siglum's MIT wrapper loads BusyTeX
  assets from Siglum's CDN. Because nothing AGPL is vendored/modified here, the
  design's licensing posture (§5.9, §13) is preserved — but the owner should
  confirm they are comfortable depending on an MIT wrapper over an AGPL base.

## Decision

The gate passes. Proceed to Task 2 with **Siglum `@siglum/engine`** as the
browser WASM engine, external CDN `https://packages.siglum.org`, and the CSP
delta above. No design-doc blocker is required.