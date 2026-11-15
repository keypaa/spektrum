// @vitest-environment node
// next.config.ts is the safety net for deployments that are not behind Caddy
// (a plain `next start`). These headers must be present there too.
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("security headers", () => {
  it("sets the hardening headers in next.config.ts", async () => {
    const config = nextConfig as unknown as {
      headers?: () => Promise<
        Array<{ headers: Array<{ key: string; value: string }> }>
      >;
    };
    expect(typeof config.headers).toBe("function");
    const rules = (await config.headers!()) ?? [];
    const values = new Map(
      rules.flatMap((rule) =>
        rule.headers.map((h) => [h.key.toLowerCase(), h.value]),
      ),
    );
    expect(values.get("x-content-type-options")).toBe("nosniff");
    expect(values.get("x-frame-options")).toBe("DENY");
    expect(values.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(values.get("content-security-policy")).toContain("default-src 'self'");
    expect(values.get("content-security-policy")).toContain("worker-src 'self' blob:");
  });
});