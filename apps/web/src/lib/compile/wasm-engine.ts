// Browser-side TeX compilation. The engine bytes are never vendored: the SDK
// module is loaded lazily and its runtime (WASM, bundles, TeX Live packages) is
// resolved from the CDN picked in Task 1.
//
// Attribution: @siglum/engine 0.2.2 — MIT, Copyright 2026 Siglum Project —
// built on BusyTeX / TeX Live 2026 and served from https://packages.siglum.org.

import type { Diagnostic, ProjectStats } from "@spektrum/shared/compile";

export const ENGINE_ASSET_ORIGIN = "https://packages.siglum.org";
export const ENGINE_VERSION = "0.2.2";
export const ENGINE_ATTRIBUTION =
  "@siglum/engine 0.2.2 (MIT, © 2026 Siglum Project) — BusyTeX / TeX Live 2026 runtime from https://packages.siglum.org";

export type CompileInput = {
  files: Record<string, string | Uint8Array>;
  mainFile: string;
};

export type CompileOutcome = {
  pdf: Uint8Array;
  log: string;
  synctex: Uint8Array | null;
  diagnostics: Diagnostic[];
  stats: ProjectStats | null;
  durationMs: number;
  ok: boolean;
};

export type WasmEngineLike = {
  load(): Promise<void>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  run(mainFile: string): Promise<CompileOutcome>;
};

const utf8 = new TextEncoder();
const decoder = new TextDecoder();

// One load per engine instance. A rejected load is evicted so a later call can
// retry instead of caching a broken engine forever.
const loadPromises = new WeakMap<WasmEngineLike, Promise<void>>();

export function loadEngineOnce(engine: WasmEngineLike): Promise<void> {
  const existing = loadPromises.get(engine);
  if (existing) return existing;
  const pending = engine.load().catch((error: unknown) => {
    loadPromises.delete(engine);
    throw error;
  });
  loadPromises.set(engine, pending);
  return pending;
}

/**
 * Write the project into the engine's in-memory filesystem and compile it.
 * The engine is injectable so callers (and tests) can supply their own instance;
 * without one a worker-backed engine loading from the CDN is created lazily.
 */
export async function compileInBrowser(
  input: CompileInput,
  engine?: WasmEngineLike,
): Promise<CompileOutcome> {
  const target = engine ?? createWorkerEngine();
  await loadEngineOnce(target);
  for (const [path, contents] of Object.entries(input.files)) {
    await target.write(
      path,
      typeof contents === "string" ? utf8.encode(contents) : contents,
    );
  }
  return target.run(input.mainFile);
}

/** Turn a TeX log into the compact diagnostics the rest of the app consumes. */
export function parseDiagnostics(
  log: string,
  error?: string,
  failed = false,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const raw of log.split("\n")) {
    const line = raw.trimEnd();
    if (!line) continue;
    const located = /^(\S+?):(\d+):\s*(.*)$/.exec(line);
    const message = located?.[3] ?? line;
    const severity: Diagnostic["severity"] = /^(!|.*\berror\b)/i.test(line)
      ? "error"
      : /(warning|overfull|underfull)/i.test(line)
        ? "warning"
        : "info";
    if (severity === "info" && !located) continue;
    const diagnostic: Diagnostic = { severity, message, raw: line };
    if (located?.[1] !== undefined) diagnostic.file = located[1];
    if (located?.[2] !== undefined) diagnostic.line = Number(located[2]) - 1;
    diagnostics.push(diagnostic);
    if (diagnostics.length >= 200) break;
  }
  if (failed || error) {
    if (!diagnostics.some((d) => d.severity === "error")) {
      const message = error ?? "compilation failed";
      diagnostics.unshift({ severity: "error", message, raw: message });
    }
  }
  return diagnostics;
}

type SiglumRuntime = {
  wasmUrl: string;
  jsUrl: string;
  bundlesUrl: string;
  ctanProxyUrl: string;
  xzwasmUrl: string;
};

type SiglumResult = {
  success: boolean;
  pdf?: Uint8Array;
  log?: string;
  syncTexData?: string | null;
  stats?: ProjectStats | null;
  exitCode?: number;
  error?: string;
};

type SiglumCompilerLike = {
  init(): Promise<void>;
  compile(
    source: string,
    options: {
      mainFile: string;
      additionalFiles: Record<string, string | Uint8Array>;
      engine: string;
    },
  ): Promise<SiglumResult>;
};

type SiglumModule = {
  SiglumCompiler: new (options: SiglumRuntime) => SiglumCompilerLike;
  resolveRuntime(options: { baseUrl: string }): Promise<SiglumRuntime>;
};

/** Shared mapping: the SDK result can be non-zero even when a PDF exists. */
function toOutcome(result: SiglumResult, started: number): CompileOutcome {
  const ok = result.success === true && (result.exitCode ?? 0) === 0;
  return {
    pdf: result.pdf ?? new Uint8Array(0),
    log: result.log ?? "",
    synctex: result.syncTexData ? utf8.encode(result.syncTexData) : null,
    diagnostics: parseDiagnostics(result.log ?? "", result.error, !ok),
    stats: result.stats ?? null,
    durationMs: Date.now() - started,
    ok,
  };
}

export type WasmEngineOptions = {
  /** ES module URL of the pinned SDK; required because no SDK is vendored. */
  moduleUrl?: string;
  assetOrigin?: string;
};

/**
 * Real engine adapter: dynamically imports the SDK, resolves its matching
 * runtime from the CDN origin, then maps compile results to CompileOutcome.
 */
export function createWasmEngine(options: WasmEngineOptions = {}): WasmEngineLike {
  const assetOrigin = options.assetOrigin ?? ENGINE_ASSET_ORIGIN;
  const moduleUrl =
    options.moduleUrl ?? process.env.NEXT_PUBLIC_SIGLUM_ENGINE_MODULE_URL;
  const files = new Map<string, Uint8Array>();
  let compiler: SiglumCompilerLike | null = null;

  return {
    async load() {
      if (!moduleUrl) {
        throw new Error(
          "No WASM engine module configured: set NEXT_PUBLIC_SIGLUM_ENGINE_MODULE_URL to the @siglum/engine ES module URL",
        );
      }
      const sdk = (await import(/* @vite-ignore */ moduleUrl)) as SiglumModule;
      const runtime = await sdk.resolveRuntime({ baseUrl: assetOrigin });
      compiler = new sdk.SiglumCompiler(runtime);
      await compiler.init();
    },
    async write(path, bytes) {
      files.set(path, bytes);
    },
    async run(mainFile) {
      if (!compiler) throw new Error("WASM engine is not loaded");
      const main = files.get(mainFile);
      if (!main) throw new Error(`main file was not written: ${mainFile}`);
      const additionalFiles: Record<string, string | Uint8Array> = {};
      for (const [path, bytes] of files) {
        if (path !== mainFile) additionalFiles[path] = bytes;
      }
      const started = Date.now();
      const result = await compiler.compile(decoder.decode(main), {
        mainFile,
        additionalFiles,
        engine: "auto",
      });
      return toOutcome(result, started);
    },
  };
}

// The engine runs off the main thread. A blob worker keeps the compiled bundle
// free of engine assets; the SDK module URL and CDN origin arrive as messages.
const WORKER_SOURCE = `
let compiler = null;
let files = new Map();
const dec = new TextDecoder();

self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === "load") {
      const mod = await import(event.data.moduleUrl);
      const runtime = await mod.resolveRuntime({ baseUrl: event.data.assetOrigin });
      compiler = new mod.SiglumCompiler(runtime);
      await compiler.init();
      files = new Map();
      self.postMessage({ id, ok: true });
      return;
    }
    if (type === "write") {
      files.set(event.data.path, event.data.bytes);
      self.postMessage({ id, ok: true });
      return;
    }
    if (type === "run") {
      const main = files.get(event.data.mainFile);
      if (!main) throw new Error("main file was not written: " + event.data.mainFile);
      const additionalFiles = {};
      for (const [path, bytes] of files) {
        if (path !== event.data.mainFile) additionalFiles[path] = bytes;
      }
      const started = Date.now();
      const result = await compiler.compile(dec.decode(main), {
        mainFile: event.data.mainFile,
        additionalFiles,
        engine: "auto",
      });
      // The main thread normalises the raw result into a CompileOutcome.
      self.postMessage({ id, ok: true, result, started });
      return;
    }
    throw new Error("unknown worker message: " + type);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
`;

type WorkerReply =
  | { ok: true; result?: SiglumResult; started?: number }
  | { ok: false; error: string };

/** Worker-backed implementation of the same engine boundary. */
export function createWorkerEngine(options: WasmEngineOptions = {}): WasmEngineLike {
  const assetOrigin = options.assetOrigin ?? ENGINE_ASSET_ORIGIN;
  const moduleUrl =
    options.moduleUrl ?? process.env.NEXT_PUBLIC_SIGLUM_ENGINE_MODULE_URL;
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (value: WorkerReply) => void; reject: (error: Error) => void }
  >();

  function call(type: string, payload: Record<string, unknown>): Promise<WorkerReply> {
    if (!worker) return Promise.reject(new Error("WASM worker is not loaded"));
    const id = ++nextId;
    return new Promise<WorkerReply>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker?.postMessage({ id, type, ...payload });
    });
  }

  return {
    async load() {
      if (!moduleUrl) {
        throw new Error(
          "No WASM engine module configured: set NEXT_PUBLIC_SIGLUM_ENGINE_MODULE_URL to the @siglum/engine ES module URL",
        );
      }
      const url = URL.createObjectURL(
        new Blob([WORKER_SOURCE], { type: "text/javascript" }),
      );
      worker = new Worker(url, { type: "module" });
      URL.revokeObjectURL(url);
      worker.onmessage = (event: MessageEvent<{ id: number } & WorkerReply>) => {
        const entry = pending.get(event.data.id);
        if (!entry) return;
        pending.delete(event.data.id);
        if (event.data.ok) entry.resolve(event.data);
        else entry.reject(new Error(event.data.error));
      };
      worker.onerror = (event: ErrorEvent) => {
        const error = new Error(event.message || "WASM worker failed");
        for (const entry of pending.values()) entry.reject(error);
        pending.clear();
      };
      await call("load", { moduleUrl, assetOrigin });
    },
    async write(path, bytes) {
      await call("write", { path, bytes });
    },
    async run(mainFile) {
      const reply = await call("run", { mainFile });
      if (!reply.ok) throw new Error(reply.error);
      if (!reply.result) throw new Error("WASM worker returned no result");
      return toOutcome(reply.result, reply.started ?? Date.now());
    },
  };
}
