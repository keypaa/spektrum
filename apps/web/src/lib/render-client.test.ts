// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderEvent } from "@spektrum/shared/compile";
import type { CompileOutcome } from "@/lib/compile/wasm-engine";

const REVISION = "a".repeat(64);
const PDF_KEY = "u/u1/render/11111111-1111-4000-8000-000000000000.pdf";
const SYNC_KEY = "u/u1/render/22222222-2222-4000-8000-000000000000.synctex";

const state = vi.hoisted(() => ({
  outcome: null as CompileOutcome | null,
  calls: [] as Array<[string, RequestInit | undefined]>,
}));

vi.mock("@/lib/compile/wasm-engine", () => ({
  compileInBrowser: vi.fn(async () => {
    if (!state.outcome) throw new Error("no fake outcome");
    return state.outcome;
  }),
}));

vi.mock("@/lib/upload/client", () => ({
  uploadBytesToR2: vi.fn(
    async ({ ext }: { ext: string }) => ext === "pdf" ? PDF_KEY : SYNC_KEY,
  ),
}));

import { compileInBrowser } from "@/lib/compile/wasm-engine";
import { uploadBytesToR2 } from "@/lib/upload/client";
import { runLocalCompile } from "@/lib/compile-client";
import { useLocalCompile } from "./render-client";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch() {
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    state.calls.push([target, init]);
    if (target.includes("/compile")) return json({ revision: REVISION, cached: false });
    if (target.includes("/tree")) {
      return json({
        documents: [
          { id: "d1", path: "main.tex", kind: "tex", updatedAt: "2026-11-27T00:00:00.000Z" },
        ],
      });
    }
    if (target.includes("/documents?path=")) {
      return json({
        document: {
          id: "d1",
          path: "main.tex",
          kind: "tex",
          updatedAt: "2026-11-27T00:00:00.000Z",
          content: "hello",
        },
      });
    }
    if (target.includes("/renders")) return json({ revision: REVISION });
    throw new Error(`unexpected fetch: ${target}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function outcome(ok: boolean): CompileOutcome {
  return {
    pdf: new Uint8Array([37, 80, 68, 70]),
    log: ok ? "compiled cleanly" : "main.tex:1: ! Undefined control sequence.",
    synctex: ok ? new Uint8Array([1, 2, 3]) : null,
    diagnostics: ok
      ? []
      : [{ severity: "error", message: "boom", file: "main.tex", line: 0, raw: "! boom" }],
    stats: null,
    durationMs: 12,
    ok,
  };
}

function blobUrls() {
  if (typeof URL.createObjectURL !== "function") {
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:local-pdf"),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
  }
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-pdf");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  state.calls.length = 0;
  blobUrls();
  stubFetch();
});

describe("runLocalCompile", () => {
  it("emits queued → running → result, uploads the artefacts and commits", async () => {
    state.outcome = outcome(true);
    const events: RenderEvent[] = [];
    await runLocalCompile("p1", "main.tex", (event) => events.push(event));

    expect(events.map((event) => (event.event === "status" ? event.state : event.event))).toEqual([
      "queued",
      "running",
      "result",
    ]);
    expect(compileInBrowser).toHaveBeenCalledWith({
      files: { "main.tex": "hello" },
      mainFile: "main.tex",
    });
    expect(uploadBytesToR2).toHaveBeenNthCalledWith(1, {
      bytes: state.outcome!.pdf,
      contentType: "application/pdf",
      kind: "render",
      ext: "pdf",
      projectId: "p1",
    });
    expect(uploadBytesToR2).toHaveBeenNthCalledWith(2, {
      bytes: state.outcome!.synctex,
      contentType: "application/octet-stream",
      kind: "render",
      ext: "synctex",
      projectId: "p1",
    });

    const commit = state.calls.find(([url]) => url.includes("/renders"));
    expect(commit).toBeTruthy();
    expect(commit![1]?.method).toBe("POST");
    expect(JSON.parse(String(commit![1]?.body))).toEqual({
      revision: REVISION,
      mainFile: "main.tex",
      pdfKey: PDF_KEY,
      synctexKey: SYNC_KEY,
      log: "compiled cleanly",
      diagnostics: [],
      stats: null,
      durationMs: 12,
    });

    expect(events[2]).toMatchObject({
      event: "result",
      revision: REVISION,
      pdfUrl: "blob:local-pdf",
      durationMs: 12,
    });
  });

  it("emits an error and never commits when the engine fails", async () => {
    state.outcome = outcome(false);
    const events: RenderEvent[] = [];
    await runLocalCompile("p1", "main.tex", (event) => events.push(event));

    expect(events.map((event) => (event.event === "status" ? event.state : event.event))).toEqual([
      "queued",
      "running",
      "error",
    ]);
    const failure = events[2]!;
    expect(failure.event).toBe("status");
    if (failure.event === "status") {
      expect(failure.diagnostics?.[0]?.message).toBe("boom");
      expect(failure.log).toContain("Undefined control sequence");
    }
    expect(uploadBytesToR2).not.toHaveBeenCalled();
    expect(state.calls.some(([url]) => url.includes("/renders"))).toBe(false);
  });
});

describe("useLocalCompile", () => {
  it("starts with no status and publishes the final local result", async () => {
    state.outcome = outcome(true);
    const { result } = renderHook(() => useLocalCompile("p1"));
    expect(result.current.status).toBeNull();

    await act(async () => {
      await result.current.start("main.tex");
    });

    expect(result.current.status).toMatchObject({
      event: "result",
      revision: REVISION,
      pdfUrl: "blob:local-pdf",
    });
    expect(state.calls.some(([url]) => url.includes("/renders"))).toBe(true);
  });
});
