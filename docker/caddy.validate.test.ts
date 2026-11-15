// @vitest-environment node
// `caddy validate` is the only check that catches a syntax or directive error
// in the Caddyfile; the dev server cannot, because it never parses this file.
// Skipped where Docker is unavailable (the unit CI job), like the S3 tests.
import { execFileSync } from "node:child_process";
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

describe.skipIf(!dockerAvailable())("Caddyfile", () => {
  it("passes `caddy validate`", () => {
    expect(() =>
      execFileSync(
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
        { stdio: "pipe", timeout: 120_000 },
      ),
    ).not.toThrow();
  });
});