// Worker entry point for browser compilation. It reuses the same direct adapter
// as the main thread, so SDK wiring and result mapping live in one place.
// Turbopack bundles this module (and the installed SDK) as a worker chunk.

import { createWasmEngine, ENGINE_ASSET_ORIGIN } from "./wasm-engine";
import type { CompileOutcome, WasmEngineLike } from "./wasm-engine";

type WorkerRequest =
  | { id: number; type: "load"; assetOrigin?: string }
  | { id: number; type: "write"; path: string; bytes: Uint8Array }
  | { id: number; type: "run"; mainFile: string };

type WorkerReply =
  | { id: number; ok: true; outcome?: CompileOutcome }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  postMessage(message: WorkerReply): void;
};

let engine: WasmEngineLike | null = null;

ctx.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === "load") {
      engine = createWasmEngine({
        assetOrigin: event.data.assetOrigin ?? ENGINE_ASSET_ORIGIN,
      });
      await engine.load();
      ctx.postMessage({ id, ok: true });
      return;
    }
    if (!engine) throw new Error("WASM worker is not loaded");
    if (type === "write") {
      await engine.write(event.data.path, event.data.bytes);
      ctx.postMessage({ id, ok: true });
      return;
    }
    if (type === "run") {
      const outcome = await engine.run(event.data.mainFile);
      ctx.postMessage({ id, ok: true, outcome });
      return;
    }
    throw new Error("unknown worker message: " + type);
  } catch (error) {
    ctx.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
