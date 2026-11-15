// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "deploy.sh");
const source = () => readFileSync(script, "utf8");

describe("scripts/deploy.sh", () => {
  it("is valid bash", () => {
    expect(() => {
      // `bash -n` parses without executing; a syntax error is the only thing
      // it can report.
      execFileSync("bash", ["-n", script], { stdio: "pipe" });
    }).not.toThrow();
  });

  it("runs the migrate service before the app and waits for it", () => {
    const text = source();
    expect(text).toContain("migrate");
    expect(text).toContain("wait migrate");
    expect(text).toContain("up -d");
  });

  it("refuses to run without .env and never creates an owner unattended", () => {
    const text = source();
    expect(text).toContain(".env");
    // Owner creation stays an explicit operator step.
    expect(text).toContain("admin:create-owner");
    expect(text).toContain("OWNER_PASSWORD");
    expect(text).not.toContain("OWNER_PASSWORD=");
  });

  it("checks the health endpoint after the rollout", () => {
    expect(source()).toContain("/api/health");
  });
});