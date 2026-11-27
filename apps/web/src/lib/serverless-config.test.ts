// @vitest-environment node
// The Vercel build must not inherit the VPS standalone image settings, and the
// CSP must open only the origins the serverless deployment actually needs.
import { afterEach, describe, expect, it, vi } from "vitest";

const ENGINE_CDN = "https://packages.siglum.org";
const R2_ENDPOINT = "https://abc123.r2.cloudflarestorage.com";

type NextConfigLike = {
  output?: string;
  outputFileTracingRoot?: string;
  headers?: () => Promise<
    Array<{ headers: Array<{ key: string; value: string }> }>
  >;
};

async function loadNextConfig(): Promise<NextConfigLike> {
  vi.resetModules();
  return (await import("../../next.config")).default as NextConfigLike;
}

async function cspHeader(config: NextConfigLike): Promise<string> {
  expect(typeof config.headers).toBe("function");
  const rules = (await config.headers!()) ?? [];
  const values = new Map(
    rules.flatMap((rule) =>
      rule.headers.map((h) => [h.key.toLowerCase(), h.value]),
    ),
  );
  return values.get("content-security-policy") ?? "";
}

// Clear every origin-producing variable so the test never depends on a
// developer shell (or CI) that happens to have one set.
function stubNoOrigins(): void {
  for (const name of [
    "ENGINE_ASSET_ORIGIN",
    "ENGINE_PACKAGE_ORIGIN",
    "S3_ENDPOINT",
  ]) {
    vi.stubEnv(name, "");
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("cspOrigins", () => {
  it("is empty when no engine CDN, package server or R2 endpoint is configured", async () => {
    const { cspOrigins } = await import("./serverless-config");
    expect(cspOrigins({})).toEqual([]);
  });

  it("allowlists the engine CDN, package server and R2 endpoint origins", async () => {
    const { cspOrigins } = await import("./serverless-config");
    expect(
      cspOrigins({
        ENGINE_ASSET_ORIGIN: ENGINE_CDN,
        ENGINE_PACKAGE_ORIGIN: `${ENGINE_CDN}/api/texlive`,
        S3_ENDPOINT: R2_ENDPOINT,
      }),
    ).toEqual([ENGINE_CDN, R2_ENDPOINT]);
  });

  it("refuses non-allowlisted engines and non-HTTPS endpoints", async () => {
    const { cspOrigins } = await import("./serverless-config");
    expect(
      cspOrigins({
        ENGINE_ASSET_ORIGIN: "https://engine.example.net",
        ENGINE_PACKAGE_ORIGIN: "https://packages.siglum.org.evil.test",
        S3_ENDPOINT: "http://insecure.example.net",
      }),
    ).toEqual([]);
  });
});

describe("serverless next.config.ts", () => {
  it("adds the configured origins and the worker blob script source to the CSP", async () => {
    vi.stubEnv("ENGINE_ASSET_ORIGIN", ENGINE_CDN);
    vi.stubEnv("ENGINE_PACKAGE_ORIGIN", `${ENGINE_CDN}/api/texlive`);
    vi.stubEnv("S3_ENDPOINT", R2_ENDPOINT);
    const csp = await cspHeader(await loadNextConfig());

    expect(csp).toContain(`connect-src 'self' ${ENGINE_CDN} ${R2_ENDPOINT}`);
    expect(csp).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    );
    expect(csp).toContain("worker-src 'self' blob:");
  });

  it("keeps CSP connect-src self-only when no origins are configured", async () => {
    stubNoOrigins();
    const csp = await cspHeader(await loadNextConfig());
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain(ENGINE_CDN);
    expect(csp).not.toContain(R2_ENDPOINT);
  });

  it("does not emit standalone output on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    stubNoOrigins();
    const config = await loadNextConfig();
    expect(config.output).toBeUndefined();
    // Workspace packages export TS source, so Vercel's function trace also
    // needs the monorepo root even though there is no standalone server.
    expect(config.outputFileTracingRoot).toBeDefined();
  });

  it("keeps standalone output for the VPS build", async () => {
    vi.stubEnv("VERCEL", "");
    stubNoOrigins();
    const config = await loadNextConfig();
    expect(config.output).toBe("standalone");
  });
});
