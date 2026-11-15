import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const base: NextConfig = {
  // Standalone output for the production image (docker/Dockerfile.web). The
  // tracing root is the monorepo root: `packages/*` export TypeScript source
  // through the workspace `exports` map, so the trace has to start above them.
  output: "standalone",
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  // `proxy.ts` buffers the request body so the route can read it more than
  // once; the default 10 MB would truncate a Prism archive and turn a
  // 413 into a 500. Caddy refuses over 30 MB before it reaches Node.
  experimental: {
    proxyClientMaxBodySize: "30mb",
  },
  // The same hardening Caddy sets (docker/Caddyfile), for deployments that are
  // not behind it. Caddy's copy wins where both apply.
  async headers() {
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
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