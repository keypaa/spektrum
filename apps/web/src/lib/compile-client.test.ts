import { describe, expect, it, vi } from "vitest";
import { parseRenderEvent } from "./render-client";

vi.mock("@spektrum/shared/http/guard", () => ({ assertSameOrigin: vi.fn() }));

vi.mock("@/lib/upload/client", () => ({
  uploadBytesToR2: vi.fn(async () => "u/u1/render/00000000-0000-4000-8000-000000000000.pdf"),
}));

import { uploadBytesToR2 } from "@/lib/upload/client";
import {
  commitLocalRender,
  loadCompileFiles,
  requestCompile,
  uploadRenderArtifacts,
} from "./compile-client";

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

describe("loadCompileFiles", () => {
  it("downloads large blob-backed text documents instead of an empty file", async () => {
    // .bib/.cls/.sty uploads above UPLOAD_INLINE_BYTES are stored with
    // content: null and a blobKey. They must reach the engine as bytes.
    const bibBytes = new TextEncoder().encode(
      "@article{key, title={A very large bibliography}}\n",
    );
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target === "/api/projects/p1/tree") {
        return json({
          documents: [
            { id: "d1", path: "main.tex", kind: "tex", updatedAt: "t" },
            { id: "d2", path: "refs.bib", kind: "bib", updatedAt: "t" },
            { id: "d3", path: "logo.png", kind: "img", updatedAt: "t" },
          ],
        });
      }
      if (target.includes("/documents?path=main.tex")) {
        return json({
          document: {
            id: "d1",
            path: "main.tex",
            kind: "tex",
            updatedAt: "t",
            content: "\\documentclass{article}",
            blobKey: null,
          },
        });
      }
      if (target.includes("/documents?path=refs.bib")) {
        return json({
          document: {
            id: "d2",
            path: "refs.bib",
            kind: "bib",
            updatedAt: "t",
            content: null,
            blobKey: "p1/refs.bib",
          },
        });
      }
      if (target.includes("/documents?path=logo.png")) {
        return json({
          document: {
            id: "d3",
            path: "logo.png",
            kind: "img",
            updatedAt: "t",
            content: null,
            blobKey: "p1/logo.png",
          },
        });
      }
      if (target.endsWith("/documents/d2/download")) {
        return new Response(bibBytes as unknown as BodyInit, { status: 200 });
      }
      if (target.endsWith("/documents/d3/download")) {
        return new Response(new Uint8Array([1, 2, 3]) as unknown as BodyInit, {
          status: 200,
        });
      }
      throw new Error(`unexpected fetch: ${target}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const files = await loadCompileFiles("p1");

    expect(files["main.tex"]).toBe("\\documentclass{article}");
    expect(files["refs.bib"]).toEqual(bibBytes);
    expect(files["logo.png"]).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/documents/d2/download",
    );
    vi.unstubAllGlobals();
  });
});

describe("uploadRenderArtifacts", () => {
  const outcome = {
    pdf: new Uint8Array([37, 80, 68, 70]),
    log: "ok",
    synctex: new Uint8Array([1, 2]),
    diagnostics: [],
    stats: null,
    durationMs: 4,
    ok: true,
  };

  it("uploads the PDF and SyncTeX through signed render keys", async () => {
    vi.mocked(uploadBytesToR2)
      .mockResolvedValueOnce("u/u1/render/a.pdf")
      .mockResolvedValueOnce("u/u1/render/b.synctex");

    const keys = await uploadRenderArtifacts("p1", outcome);

    expect(keys).toEqual({
      pdfKey: "u/u1/render/a.pdf",
      synctexKey: "u/u1/render/b.synctex",
    });
    expect(uploadBytesToR2).toHaveBeenNthCalledWith(1, {
      bytes: outcome.pdf,
      contentType: "application/pdf",
      kind: "render",
      ext: "pdf",
      projectId: "p1",
    });
    expect(uploadBytesToR2).toHaveBeenNthCalledWith(2, {
      bytes: outcome.synctex,
      contentType: "application/octet-stream",
      kind: "render",
      ext: "synctex",
      projectId: "p1",
    });
  });

  it("does not upload an absent SyncTeX map", async () => {
    vi.mocked(uploadBytesToR2).mockResolvedValueOnce("u/u1/render/a.pdf");
    const keys = await uploadRenderArtifacts("p1", { ...outcome, synctex: null });
    expect(keys.synctexKey).toBeNull();
    expect(uploadBytesToR2).toHaveBeenCalledTimes(1);
  });
});

describe("commitLocalRender", () => {
  it("POSTs the commit body to the ownership-checked route", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ revision: "a".repeat(64) }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const body = {
      revision: "a".repeat(64),
      mainFile: "main.tex",
      pdfKey: "u/u1/render/a.pdf",
      synctexKey: null,
      log: "ok",
      diagnostics: [],
      stats: null,
      durationMs: 4,
    };
    await commitLocalRender("p1", body);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/projects/p1/renders");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(body);
    vi.unstubAllGlobals();
  });
});
