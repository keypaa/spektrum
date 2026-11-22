import { describe, expect, it, vi } from "vitest";
import { parseRenderEvent } from "./render-client";

vi.mock("@spektrum/shared/http/guard", () => ({ assertSameOrigin: vi.fn() }));

import { requestCompile } from "./compile-client";

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
        revision: "a".repeat(64),
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

describe("requestCompile", () => {
  it("sends the force flag for a manual recompile", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ revision: "a".repeat(64), cached: false }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestCompile("p1", "main.tex", true);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      mainFile: "main.tex",
      force: true,
    });
    vi.unstubAllGlobals();
  });
});
