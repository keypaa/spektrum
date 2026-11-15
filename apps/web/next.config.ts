import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;