// Serverless-only configuration helpers. Kept out of next.config.ts so the
// origin allowlist can be exercised without importing the whole Next config.
// The VPS/Caddy path is unaffected: these variables are simply unset there.

// EnginePick from the Task 1 feasibility spike: @siglum/engine 0.2.2 (MIT)
// resolves its WASM runtime and TeX Live packages from this one CDN origin.
// Nothing outside this allowlist may be injected into the CSP from the
// environment — a mistyped or hostile value is ignored, not served to users.
const ALLOWED_ENGINE_ORIGINS = new Set(["https://packages.siglum.org"]);

function httpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    // Local SeaweedFS is http:// and must never widen a production CSP.
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Extra `connect-src` origins for the serverless deployment:
 * the engine CDN (ENGINE_ASSET_ORIGIN), its package server
 * (ENGINE_PACKAGE_ORIGIN, a URL whose path is ignored), and the R2 S3 endpoint
 * (S3_ENDPOINT, whose origin is extracted). With none set the CSP stays
 * `'self'`-only.
 */
export function cspOrigins(
  source: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  const origins = new Set<string>();
  for (const name of ["ENGINE_ASSET_ORIGIN", "ENGINE_PACKAGE_ORIGIN"] as const) {
    const origin = httpsOrigin(source[name]);
    if (origin && ALLOWED_ENGINE_ORIGINS.has(origin)) origins.add(origin);
  }
  const r2Origin = httpsOrigin(source.S3_ENDPOINT);
  if (r2Origin) origins.add(r2Origin);
  return [...origins];
}
