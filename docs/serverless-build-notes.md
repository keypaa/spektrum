# Why the serverless branch builds with webpack and stubs BLAKE3

Date: 2026-11-28
Branch: `free-serverless-deploy`
Commits: `b4f742b` (build fix), `7cc82eb` / `79b1ef5` (deployment docs)

This note records a build problem that cost a 46-minute Vercel deployment and
a two-hour local build, so nobody has to rediscover it.

## Symptom

`pnpm --filter @spektrum/web build` printed:

```
▲ Next.js 16.4.5 (Turbopack)
  Creating an optimized production build ...
```

and then produced no further output.

- On Vercel: the production deployment ran for **46 minutes** before failing
  with `Error` (deployment `spektrum-j3u651vfr`, 2026-11-27).
- Locally with `VERCEL=1`: the process stayed alive for **2h13m**, sleeping in
  `ep_poll` with near-zero CPU and ~2 GB RSS. It was killed manually.

## Root cause

The branch added `@siglum/engine@0.2.2` as a pinned MIT dependency and imports
it in `apps/web/src/lib/compile/wasm-engine.ts`. That SDK is shipped as raw ES
source, not a prebuilt browser bundle. Its import graph is:

```
@siglum/engine/src/index.js
  → src/storage.js
    → src/hash.js
      → blake3-wasm/browser.js
        → dist/wasm/browser/blake3_js_bg.wasm   (a binary WASM module)
        → ./blake3_js_bg.js                     (does not exist in the package)
```

Next 16's Turbopack build never reports a useful error for this graph; it just
stalls during module-graph construction. Forcing webpack makes the same defect
visible immediately:

```
Module parse failed: Unexpected character ' ' (1:0)
The module seem to be a WebAssembly module, but module is not flagged as WebAssembly module for webpack.
Module not found: Can't resolve './blake3_js_bg.js'
```

The `blake3-wasm` browser entry is broken upstream, and `esm.sh` cannot bundle
it either (`https://esm.sh/@siglum/engine@0.2.2?bundle` returns 500 with
`could not resolve "./blake3_js_bg.js"`).

## What we do instead

1. **Stub the optional accelerator at build time.** `apps/web/next.config.ts`
   aliases `blake3-wasm/browser.js` (and `blake3-wasm`) to
   `apps/web/src/lib/compile/blake3-stub.js`, which throws on import. The Siglum
   SDK already catches that failure and falls back to its pure-JS DJB2 hasher.
   DJB2 is non-cryptographic but sufficient for the SDK's change detection.
2. **Build this branch with webpack.** `apps/web/package.json` uses
   `next build --webpack`. Webpack finishes this repository in about **21
   seconds**; Turbopack stalls indefinitely on the same tree.
3. **Keep the engine runtime external.** The SDK's MIT JavaScript bundle is
   installed from npm, but the TeX Live 2026 WASM assets, format files and
   on-demand packages stay on `https://packages.siglum.org`. No AGPL artifact
   is vendored or modified in this repo. This was the outcome of the Task 1
   feasibility probe (`zenno/docs/2026-11-27-wasm-feasibility.md`).
4. **Keep the Vercel copy-script guard.** `copy-pdf-worker.mjs --server` skips
   the standalone-only server chunk target when `VERCEL=1`, because Vercel
   builds its own function output.

## Alternatives that were rejected

| Option | Why not |
|---|---|
| Keep Turbopack and enable WebAssembly experiments | Next does not expose the needed `experiments.asyncWebAssembly` / module-rule configuration, and the missing `blake3_js_bg.js` still fails. |
| Load the SDK from `packages.siglum.org` directly | The probe found the CDN serves engine runtime assets but **not** the SDK JavaScript. Task 6 originally required `NEXT_PUBLIC_SIGLUM_ENGINE_MODULE_URL`; a fresh deploy would have had no compile path. |
| Load a bundled SDK from `esm.sh` | Returns HTTP 500: the same missing `blake3_js_bg.js` import. |
| Switch engines (BusyTeX, SwiftLaTeX, wasmtex) | All three failed the Task 1 probe: no CORS on release assets, no engine SDK on npm, or no SyncTeX. Siglum was the only viable external-CDN engine. |
| Drop compilation | Rejected as an anti-goal — Prism users need to compile documents. |

## Result

- `VERCEL=1 pnpm --filter @spektrum/web build` completes in ~21 s (was 46 min
  on Vercel / 2h13m locally).
- Live deployment: https://spektrum-olive.vercel.app
- `pnpm test`: 1,096 passed / 8 skipped; `pnpm typecheck` and `pnpm lint` clean.

## Runtime CSP (the other half of "Initializing…")

The `VERCEL=1` production build is not enough; the page must also load engine
code under CSP. The SDK pulls `xzwasm.js` **directly from
`https://packages.siglum.org`** as a script, fetches `busytex.js` and converts
it to a blob for `importScripts`, and downloads `busytex.wasm`. A CSP with only
`connect-src` allowlisting is insufficient.

Observed failure before `02236c2`:

```
[console.error] Loading the script
'https://packages.siglum.org/releases/.../xzwasm.js' violates the following
Content Security Policy directive: "script-src 'self' 'unsafe-inline'
'unsafe-eval' blob:". The action has been blocked.
```

The PDF pane stayed at `Initializing...`. Fix: add the engine origins to **both**
`script-src` and `connect-src`, keep `script-src blob:`, and keep
`worker-src 'self' blob:`.

### Measured engine stats (probed on a machine + headless Chromium)

| Item | Value |
|---|---|
| `@siglum/engine` | 0.2.2, `@siglum/engine@latest` CDN origin `https://packages.siglum.org` |
| `latest.json` pointer | ~354 B, ~0.25 s |
| `runtime.json` manifest | 128 files, ~17.9 KB, ~302.5 MiB total across on-demand bundles |
| `wasm/busytex.wasm` | **32,282,976 bytes = ~30.79 MiB**, `application/wasm`, `Accept-Ranges`, CORS `*` |
| `wasm/busytex.js` | ~0.29 MiB |
| `worker.js` | ~0.12 MiB |
| `xzwasm.js` | ~0.02 MiB |
| Sample CDN download | ~55 MB/s on one host (not a guarantee; browser caching applies) |

CDN responses are CORS-open (`access-control-allow-origin: *`) and `HEAD`/`Range`
work. First load pays ~30 MiB for `busytex.wasm` plus on-demand package bundles;
the build-time webpack stub does not change that runtime cost.

### Known performance limitation

`compileInBrowser` currently creates a fresh worker per compile and terminates
it in `finally` to avoid leaking ~30 MB, so each compile re-reads the WASM and
re-initializes. That means compile time includes engine re-initialization, not
just TeX work. The CSP fix removes the blocker; worker reuse would be a
separate performance change.

## If this breaks again

- Check that `apps/web/package.json` still says `next build --webpack`.
- Check that `next.config.ts` still aliases both `blake3-wasm` specifiers to the
  stub. If Siglum changes its import path, add the new specifier.
- Check `@siglum/engine` is still pinned to `0.2.2`. On upgrade, re-run the Task
  1 probe and confirm whether the BLAKE3 import was fixed upstream.
- A runtime symptom of the stub is a one-time console warning from the SDK;
  compilation still works via the DJB2 fallback. Slightly slower hashing on
  large documents is expected.
