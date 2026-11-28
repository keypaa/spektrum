import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { cspOrigins } from "./src/lib/serverless-config";

// Vercel sets VERCEL=1 during its build. Its builder owns the output layout,
// so the VPS-only standalone server must not be emitted there.
const isVercel = process.env.VERCEL === "1";

const base: NextConfig = {
  // Standalone output is for the production image (docker/Dockerfile.web);
  // Vercel builds its own function bundles. The tracing root stays for both:
  // `packages/*` export TypeScript source through the workspace `exports` map,
  // so any trace (including Vercel's function trace) has to start at the
  // monorepo root or those files are missing at runtime.
  ...(isVercel ? {} : { output: "standalone" as const }),
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  // `proxy.ts` buffers the request body so the route can read it more than
  // once; the default 10 MB would truncate a Prism archive and turn a
  // 413 into a 500. Caddy refuses over 30 MB before it reaches Node.
  experimental: {
    proxyClientMaxBodySize: "30mb",
  },
  // The Siglum SDK's optional BLAKE3 accelerator ships a broken browser entry
  // (it imports a missing blake3_js_bg.js). The SDK already falls back to DJB2
  // when that import fails, so stub it at build time. Next 16's Turbopack build
  // stalls on the WASM graph; webpack builds this branch correctly.
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "blake3-wasm/browser.js": path.resolve(
        import.meta.dirname,
        "src/lib/compile/blake3-stub.js",
      ),
      "blake3-wasm": path.resolve(
        import.meta.dirname,
        "src/lib/compile/blake3-stub.js",
      ),
    };
    return config;
  },
  // The same hardening Caddy sets (docker/Caddyfile), for deployments that are
  // not behind it. Caddy's copy wins where both apply.
  async headers() {
    // Read at call time so build-time env changes are honoured; empty values
    // leave the CSP exactly as self-only (the VPS/Caddy path is unchanged).
    const origins = cspOrigins(process.env);
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Siglum's worker loads its fetched busytex.js from a blob URL,
              // and pulls xzwasm.js straight from the engine CDN.
              ["script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:", ...origins].join(" "),
              // The worker itself is created from a blob URL (unchanged).
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              ["connect-src 'self'", ...origins, "data:"].join(" "),
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Sentry's build integration is only worth its cost (source-map upload) when
// the operator opted in with a DSN *and* build credentials. Without it the app
// still reports errors through instrumentation.ts — this wrapping is about
// readable stack traces, not about capture.
const sentryBuildEnabled =
  Boolean(process.env.SENTRY_DSN) && Boolean(process.env.SENTRY_AUTH_TOKEN);

// `withSentryConfig` is imported statically: Next transpiles this file to CJS,
// which cannot carry a top-level `await import()`.
const nextConfig = sentryBuildEnabled
  ? withSentryConfig(base, {
      ...(process.env.SENTRY_ORG ? { org: process.env.SENTRY_ORG } : {}),
      ...(process.env.SENTRY_PROJECT ? { project: process.env.SENTRY_PROJECT } : {}),
      silent: process.env.CI !== "true",
      widenClientFileUpload: false,
    })
  : base;

export default nextConfig;