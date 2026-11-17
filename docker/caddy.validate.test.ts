// @vitest-environment node
// `caddy validate` is the only check that catches a syntax or directive error
// in the Caddyfile; the dev server cannot, because it never parses this file.
//
// It also asserts the *shape*: the metrics endpoint must be the global option
// (served on the admin port), never a site directive, which would publish an
// unauthenticated /metrics on PUBLIC_URL.
// Skipped where Docker is unavailable (the unit CI job), like the S3 tests.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["version", "--format", "{{.Server.Version}}"], {
      stdio: "ignore",
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

const caddyfile = resolve(import.meta.dirname, "Caddyfile");

const validate = (): string => {
  try {
    return execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-e",
        "PUBLIC_URL=https://app.example.com",
        "-e",
        "ACME_EMAIL=ops@example.com",
        "-e",
        "SENTRY_INGEST_HOST=",
        "-v",
        `${caddyfile}:/etc/caddy/Caddyfile:ro`,
        "caddy:2",
        "caddy",
        "validate",
        "--config",
        "/etc/caddy/Caddyfile",
      ],
      { stdio: "pipe", timeout: 120_000, encoding: "utf8" },
    );
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string };
    throw new Error(`${err.stderr ?? ""}${err.stdout ?? ""}`);
  }
};

const adapt = (): Record<string, unknown> => {
  const adapted = execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-e",
      "PUBLIC_URL=https://app.example.com",
      "-e",
      "ACME_EMAIL=ops@example.com",
      "-e",
      "SENTRY_INGEST_HOST=",
      "-v",
      `${caddyfile}:/etc/caddy/Caddyfile:ro`,
      "caddy:2",
      "caddy",
      "adapt",
      "--config",
      "/etc/caddy/Caddyfile",
    ],
    { stdio: "pipe", timeout: 120_000, encoding: "utf8" },
  );
  return JSON.parse(adapted) as Record<string, unknown>;
};

/** Every object whose `handler` is `name`, anywhere in the adapted config. */
const handlersNamed = (
  node: unknown,
  name: string,
): Array<Record<string, unknown>> => {
  if (Array.isArray(node)) return node.flatMap((child) => handlersNamed(child, name));
  if (node === null || typeof node !== "object") return [];
  const object = node as Record<string, unknown>;
  const own = object.handler === name ? [object] : [];
  return [...own, ...Object.values(object).flatMap((child) => handlersNamed(child, name))];
};

describe.skipIf(!dockerAvailable())("Caddyfile", () => {
  it("passes `caddy validate`", () => {
    expect(validate()).toContain("Valid configuration");
  });

  it("collects metrics on the admin endpoint only, not on the public site", () => {
    const config = adapt();

    /** Every `handler` name anywhere in the adapted config. */
    const handlers = (node: unknown): string[] => {
      if (Array.isArray(node)) return node.flatMap(handlers);
      if (node === null || typeof node !== "object") return [];
      const object = node as Record<string, unknown>;
      const own = typeof object.handler === "string" ? [object.handler] : [];
      return [...own, ...Object.values(object).flatMap(handlers)];
    };

    // A site-level `metrics` directive becomes a metrics *handler* on the
    // public route; the global option configures the admin endpoint instead.
    expect(handlers(config)).not.toContain("metrics");
    expect(readFileSync(caddyfile, "utf8")).toMatch(/^\tmetrics$/m);
  });

  // next.config.ts already sets these five, and a plain `header` directive
  // appends to them: every response then carried two CSPs, which browsers
  // intersect. Caddy must overwrite (`>`), which adapts to `set`, not `add`.
  it("overwrites the app's security headers instead of appending", () => {
    const [headers] = handlersNamed(adapt(), "headers");
    expect(headers).toBeDefined();
    const response = headers.response as {
      set?: Record<string, string[]>;
      add?: Record<string, string[]>;
    };
    for (const name of [
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]) {
      expect(Object.keys(response.set ?? {})).toContain(name);
      expect(Object.keys(response.add ?? {})).not.toContain(name);
    }
  });
});