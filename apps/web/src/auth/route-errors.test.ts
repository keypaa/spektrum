// @vitest-environment node
// The 500 path used to `console.error` the raw error. An error message can
// carry anything the failing code put in it — an upstream response, a header,
// a token — so the logger must redact before it reaches stdout.
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorResponse } from "./route-errors";

const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
const error = vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  write.mockClear();
  error.mockClear();
});

describe("errorResponse", () => {
  it("answers 500 with a generic body", async () => {
    const res = errorResponse(new Error("boom"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal_error" });
  });

  it("logs the failure through the redacting logger, not console.error", async () => {
    errorResponse(
      new Error("upstream said Authorization: Bearer sk-abcdef1234567890"),
    );
    expect(error).not.toHaveBeenCalled();
    const line = write.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(line).toContain("route.unhandled");
    expect(line).not.toContain("sk-abcdef1234567890");
  });

  it("redacts a bearer token that is not shaped like an API key", async () => {
    errorResponse(new Error("header was Bearer abcdefghijklmnopqrst"));
    const line = write.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(line).not.toContain("abcdefghijklmnopqrst");
    expect(line).toContain("[redacted]");
  });
});