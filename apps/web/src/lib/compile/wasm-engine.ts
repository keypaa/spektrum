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

async function runWithEngine(
  engine: WasmEngineLike,
  input: CompileInput,
): Promise<CompileOutcome> {
  await loadEngineOnce(engine);
  for (const [path, contents] of Object.entries(input.files)) {
    await engine.write(
      path,
      typeof contents === "string" ? utf8.encode(contents) : contents,
    );
  }
  return engine.run(input.mainFile);
}

/**
 * Write the project into the engine's in-memory filesystem and compile it.
 * The engine is injectable so callers (and tests) can supply their own instance.
 * By default the worker path is tried first; if the worker cannot be built or
 * its protocol fails (e.g. no nested dedicated workers in Safari), retry once
 * through the direct main-thread adapter.
 */
export async function compileInBrowser(
  input: CompileInput,
  engine?: WasmEngineLike,
): Promise<CompileOutcome> {
  if (engine) return runWithEngine(engine, input);
  try {
    return await runWithEngine(createWorkerEngine(), input);
  } catch {
    return runWithEngine(createWasmEngine(), input);
  }
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
  /** Runtime asset origin; defaults to the EnginePick CDN from Task 1. */
  assetOrigin?: string;
};

/**
 * Direct adapter: lazily imports the pinned SDK, resolves its matching runtime
 * from the external CDN, then maps compile results to CompileOutcome. Used as
 * the main-thread engine and as the fallback when a worker is unavailable.
 */
export function createWasmEngine(options: WasmEngineOptions = {}): WasmEngineLike {
  const assetOrigin = options.assetOrigin ?? ENGINE_ASSET_ORIGIN;
  const files = new Map<string, Uint8Array>();
  let compiler: SiglumCompilerLike | null = null;

  return {
    async load() {
      const sdk = await import("@siglum/engine");
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

type WorkerReply =
  | { ok: true; outcome?: CompileOutcome }
  | { ok: false; error: string };

/**
 * Worker-backed implementation of the same engine boundary. The worker entry
 * imports the installed SDK itself, so no runtime module URL is needed here.
 */
export function createWorkerEngine(options: WasmEngineOptions = {}): WasmEngineLike {
  const assetOrigin = options.assetOrigin ?? ENGINE_ASSET_ORIGIN;
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
      // `new Worker(new URL(...))` is bundled by Turbopack (as in the Monaco
      // environment) instead of fetching engine bytes at runtime.
      worker = new Worker(new URL("./wasm-worker.ts", import.meta.url), {
        type: "module",
      });
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
      await call("load", { assetOrigin });
    },
    async write(path, bytes) {
      await call("write", { path, bytes });
    },
    async run(mainFile) {
      const reply = await call("run", { mainFile });
      if (!reply.ok) throw new Error(reply.error);
      if (!reply.outcome) throw new Error("WASM worker returned no outcome");
      return reply.outcome;
    },
  };
}
