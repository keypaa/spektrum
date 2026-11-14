import { describe, expect, it } from "vitest";
import { parseRenderEvent } from "./render-client";

describe("parseRenderEvent", () => {
  it("parses a status event", () => {
    const event = parseRenderEvent(
      JSON.stringify({ event: "status", state: "running", revision: "a".repeat(64) }),
    );
    expect(event?.event).toBe("status");
  });

  it("parses a conflict event with its documentId", () => {
    const event = parseRenderEvent(
      JSON.stringify({
        event: "conflict",
        revision: "a".repeat(64),
        documentId: crypto.randomUUID(),
      }),
    );
    expect(event?.event).toBe("conflict");
    if (event?.event === "conflict") {
      expect(event.documentId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("parses a result event", () => {
    const event = parseRenderEvent(
      JSON.stringify({
        event: "result",
        pdfUrl: "/api/projects/x/render/y/pdf",
        diagnostics: [],
        stats: {
          words: 1,
          wordsInText: 1,
          wordsInHeaders: 0,
          wordsOutsideText: 0,
          headers: 0,
          figures: 0,
          mathInline: 0,
          mathDisplay: 0,
        },
        durationMs: 10,
      }),
    );
    expect(event?.event).toBe("result");
  });

  it("returns null for malformed data", () => {
    expect(parseRenderEvent("{")).toBeNull();
    expect(parseRenderEvent(JSON.stringify({ event: "bogus" }))).toBeNull();
  });
});
