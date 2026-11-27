import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compileInBrowser, createWasmEngine } from "./wasm-engine";
import type { CompileOutcome } from "./wasm-engine";

const sdk = vi.hoisted(() => ({
  resolveRuntime: vi.fn(),
  compilerCtor: vi.fn(),
  init: vi.fn(),
  compile: vi.fn(),
}));

vi.mock("@siglum/engine", () => ({
  resolveRuntime: sdk.resolveRuntime,
  SiglumCompiler: class {
    constructor(options: unknown) {
      sdk.compilerCtor(options);
    }
    init(): Promise<void> {
      return sdk.init();
    }
    compile(...args: unknown[]): Promise<unknown> {
      return sdk.compile(...args);
    }
  },
}));

const runtime = {
  wasmUrl: "https://packages.siglum.org/releases/tl2026-abc/wasm/busytex.wasm",
  jsUrl: "https://packages.siglum.org/releases/tl2026-abc/wasm/busytex.js",
  bundlesUrl: "https://packages.siglum.org/releases/tl2026-abc/bundles",
  ctanProxyUrl: "https://packages.siglum.org",
  xzwasmUrl: "https://packages.siglum.org/releases/tl2026-abc/xzwasm.js",
};

function sdkResult(exitCode = 0): Record<string, unknown> {
  return {
    success: exitCode === 0,
    pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    log: "! Undefined control sequence.\nOutput written on main.pdf.",
    syncTexData: "synctex bytes",
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
    exitCode,
  };
}

const input = {
  files: {
    "main.tex": "\\documentclass{article}\\begin{document}Hi\\end{document}",
    "chapter.tex": "Chapter text",
  },
  mainFile: "main.tex",
};

class WorkingWorker {
  static constructed = 0;
  static outcome: CompileOutcome | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;

  constructor() {
    WorkingWorker.constructed++;
  }

  postMessage(message: { id: number; type: string }): void {
    const reply =
      message.type === "run"
        ? {
            id: message.id,
            ok: true,
            outcome: WorkingWorker.outcome ?? {
              pdf: new Uint8Array([1]),
              log: "worker log",
              synctex: null,
              diagnostics: [],
              stats: null,
              durationMs: 1,
              ok: true,
            },
          }
        : { id: message.id, ok: true };
    queueMicrotask(() => this.onmessage?.({ data: reply }));
  }

  terminate(): void {}
}

class FailingWorker {
  static constructed = 0;
  constructor() {
    FailingWorker.constructed++;
    throw new Error("nested dedicated workers are not supported");
  }
}

class FailingProtocolWorker {
  static constructed = 0;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;

  constructor() {
    FailingProtocolWorker.constructed++;
  }

  postMessage(message: { id: number; type: string }): void {
    const reply =
      message.type === "run"
        ? { id: message.id, ok: false, error: "worker run protocol failed" }
        : { id: message.id, ok: true };
    queueMicrotask(() => this.onmessage?.({ data: reply }));
  }

  terminate(): void {}
}

beforeEach(() => {
  vi.clearAllMocks();
  WorkingWorker.constructed = 0;
  FailingWorker.constructed = 0;
  delete process.env.NEXT_PUBLIC_SIGLUM_ENGINE_MODULE_URL;
  sdk.resolveRuntime.mockResolvedValue(runtime);
  sdk.init.mockResolvedValue(undefined);
  sdk.compile.mockResolvedValue(sdkResult(0));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createWasmEngine with the installed SDK", () => {
  it("loads @siglum/engine directly from the CDN runtime without an env var", async () => {
    const engine = createWasmEngine();
    const outcome = await compileInBrowser(input, engine);

    expect(sdk.resolveRuntime).toHaveBeenCalledWith({
      baseUrl: "https://packages.siglum.org",
    });
    expect(sdk.compilerCtor).toHaveBeenCalledWith(runtime);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.compile).toHaveBeenCalledTimes(1);
    const [source, options] = sdk.compile.mock.calls[0]! as [
      string,
      { mainFile: string; additionalFiles: Record<string, unknown>; engine: string },
    ];
    expect(source).toContain("\\documentclass{article}");
    expect(options.mainFile).toBe("main.tex");
    expect(options.additionalFiles).toEqual({
      "chapter.tex": new TextEncoder().encode("Chapter text"),
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.pdf).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(outcome.synctex).toEqual(new TextEncoder().encode("synctex bytes"));
    expect(outcome.stats?.words).toBe(1);
  });

  it("maps a non-zero SDK exit code to ok:false with diagnostics", async () => {
    sdk.compile.mockResolvedValue(sdkResult(1));

    const outcome = await compileInBrowser(input, createWasmEngine());

    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });
});

describe("compileInBrowser default engine", () => {
  it("keeps the worker path when the worker constructs and replies", async () => {
    WorkingWorker.outcome = {
      pdf: new Uint8Array([9]),
      log: "worker log",
      synctex: null,
      diagnostics: [],
      stats: null,
      durationMs: 7,
      ok: true,
    };
    vi.stubGlobal("Worker", WorkingWorker);

    const outcome = await compileInBrowser(input);

    expect(WorkingWorker.constructed).toBe(1);
    expect(sdk.resolveRuntime).not.toHaveBeenCalled();
    expect(sdk.compile).not.toHaveBeenCalled();
    expect(outcome).toBe(WorkingWorker.outcome);
  });

  it("retries once on the main thread when the worker cannot be constructed", async () => {
    vi.stubGlobal("Worker", FailingWorker);

    const outcome = await compileInBrowser(input);

    expect(FailingWorker.constructed).toBe(1);
    expect(sdk.resolveRuntime).toHaveBeenCalledTimes(1);
    expect(sdk.compile).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(true);
  });

  it("retries once on the main thread when the worker protocol errors", async () => {
    vi.stubGlobal("Worker", FailingProtocolWorker);

    const outcome = await compileInBrowser(input);

    expect(FailingProtocolWorker.constructed).toBe(1);
    expect(sdk.resolveRuntime).toHaveBeenCalledTimes(1);
    expect(sdk.compile).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(true);
  });
});
