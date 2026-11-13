import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  saveDocumentRequest,
  type SaveResult,
} from "./save-document";
import type { DocumentRecord } from "./documents";

const RESULT: SaveResult = {
  documentId: "d1",
  updatedAt: "2026-11-12T10:00:01.000Z",
  revisionHash: "a".repeat(64),
};

const CURRENT: DocumentRecord = {
  id: "d1",
  path: "main.tex",
  kind: "tex",
  updatedAt: "2026-11-12T10:00:02.000Z",
  content: "someone else wrote this",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveDocumentRequest", () => {
  it("parses the 200 body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => json(RESULT)),
    );
    const result = await saveDocumentRequest("p1", "d1", "text", "2026-11-12T10:00:00.000Z");
    expect(result).toEqual(RESULT);
  });

  it("throws ConflictError carrying the current document on 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => json({ error: "conflict", document: CURRENT }, 409)),
    );
    let thrown: unknown;
    try {
      await saveDocumentRequest("p1", "d1", "text", "2026-11-12T10:00:00.000Z");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ConflictError);
    expect((thrown as ConflictError).current).toEqual(CURRENT);
  });

  it("throws a plain error on 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "internal_error" }, 500)),
    );
    await expect(
      saveDocumentRequest("p1", "d1", "text", "2026-11-12T10:00:00.000Z"),
    ).rejects.toThrow();
  });

  it("forwards keepalive and hits the §19.2 endpoint with the baseline", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]): Promise<Response> => json(RESULT));
    vi.stubGlobal("fetch", fetchMock);
    await saveDocumentRequest(
      "p1",
      "d1",
      "text",
      "2026-11-12T10:00:00.000Z",
      { keepalive: true },
    );
    const call = fetchMock.mock.calls[0]!;
    const [url, init] = call as unknown as [string, RequestInit];
    expect(String(url)).toBe("/api/projects/p1/documents/d1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      content: "text",
      baseUpdatedAt: "2026-11-12T10:00:00.000Z",
    });
    expect(init.keepalive).toBe(true);
  });
});