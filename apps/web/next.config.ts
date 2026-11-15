import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `proxy.ts` buffers the request body so the route can read it more than
  // once; the default 10 MB would truncate a Prism archive and turn a
  // 413 into a 500. Caddy refuses over 30 MB before it reaches Node.
  experimental: {
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;