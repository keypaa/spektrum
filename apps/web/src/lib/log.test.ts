// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { log, redactLine } from "./log";

describe("log", () => {
  it("writes one JSON line per event", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info("compile.start", { projectId: "p1" });
    const line = write.mock.calls[0]?.[0]?.toString().trim();
    expect(line).toBeDefined();
    const parsed = JSON.parse(line!) as Record<string, unknown>;
    expect(parsed).toMatchObject({ level: "info", event: "compile.start", projectId: "p1" });
    expect(typeof parsed.time).toBe("string");
    write.mockRestore();
  });

  it("redacts authorization headers, api keys, tokens and DSNs", () => {
    const line = redactLine(
      JSON.stringify({
        authorization: "Bearer sk-abcdef1234567890",
        apiKey: "sk-abcdef1234567890",
        note: "call failed with Authorization: Bearer sk-abcdef1234567890",
        dsn: "https://key@o1.ingest.sentry.io/1",
        awsKey: "AKIAIOSFODNN7EXAMPLE",
      }),
    );
    expect(line).not.toContain("sk-abcdef1234567890");
    expect(line).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(line).not.toContain("o1.ingest.sentry.io");
    expect(line).toContain("[redacted]");
  });

  it("never writes a secret field value", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.error("llm.failed", {
      authorization: "Bearer sk-abcdef1234567890",
      llmApiKeyCiphertext: "deadbeefdeadbeef",
      message: "upstream said no",
    });
    const line = write.mock.calls[0]?.[0]?.toString() ?? "";
    expect(line).not.toContain("sk-abcdef1234567890");
    expect(line).not.toContain("deadbeefdeadbeef");
    expect(line).toContain("upstream said no");
    write.mockRestore();
  });
});