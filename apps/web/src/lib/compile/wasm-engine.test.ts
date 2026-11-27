import { describe, expect, it, vi } from "vitest";
import type { CompileOutcome, WasmEngineLike } from "./wasm-engine";
import { compileInBrowser } from "./wasm-engine";

function sampleOutcome(overrides: Partial<CompileOutcome> = {}): CompileOutcome {
  return {
    pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    log: "Output written on main.pdf.",
    synctex: null,
    diagnostics: [],
    stats: null,
    durationMs: 42,
    ok: true,
    ...overrides,
  };
}

describe("compileInBrowser", () => {
  it("forwards every file path and the main file, returning the engine outcome unchanged", async () => {
    const outcome = sampleOutcome({ durationMs: 17 });
    const load = vi.fn(async () => undefined);
    const write = vi.fn(async (_path: string, _bytes: Uint8Array) => undefined);
    const run = vi.fn(async (_mainFile: string) => outcome);
    const engine: WasmEngineLike = { load, write, run };

    const result = await compileInBrowser(
      {
        files: {
          "main.tex": "\\documentclass{article}\\begin{document}Hi\\end{document}",
          "chapter.tex": "Chapter text",
          "figures/plot.png": new Uint8Array([137, 80, 78, 71]),
        },
        mainFile: "main.tex",
      },
      engine,
    );

    expect(load).toHaveBeenCalledTimes(1);
    expect(write.mock.calls.map(([path]) => path)).toEqual([
      "main.tex",
      "chapter.tex",
      "figures/plot.png",
    ]);
    expect(write.mock.calls[0]?.[1]).toEqual(
      new TextEncoder().encode(
        "\\documentclass{article}\\begin{document}Hi\\end{document}",
      ),
    );
    expect(write.mock.calls[1]?.[1]).toEqual(
      new TextEncoder().encode("Chapter text"),
    );
    expect(write.mock.calls[2]?.[1]).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("main.tex");
    expect(result).toBe(outcome);
  });

  it("reports ok:false with diagnostics when the engine returns a non-zero status", async () => {
    // A non-zero TeX exit code is surfaced by the engine as a failed outcome
    // with parsed diagnostics; the wrapper must not turn it into a success.
    const diagnostics = [
      {
        severity: "error" as const,
        message: "Undefined control sequence.",
        file: "main.tex",
        line: 3,
        raw: "! Undefined control sequence.",
      },
    ];
    const failed = sampleOutcome({
      pdf: new Uint8Array(0),
      log: "! Undefined control sequence.\nLatex Error: non-zero exit code 1",
      ok: false,
      diagnostics,
    });
    const engine: WasmEngineLike = {
      load: async () => undefined,
      write: async () => undefined,
      run: async () => failed,
    };

    const result = await compileInBrowser(
      { files: { "main.tex": "broken" }, mainFile: "main.tex" },
      engine,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(diagnostics);
    expect(result.log).toContain("non-zero exit code 1");
  });

  it("loads the engine once across two calls with the same instance", async () => {
    const load = vi.fn(async () => undefined);
    const engine: WasmEngineLike = {
      load,
      write: async () => undefined,
      run: async () => sampleOutcome(),
    };

    await compileInBrowser(
      { files: { "main.tex": "first" }, mainFile: "main.tex" },
      engine,
    );
    await compileInBrowser(
      { files: { "main.tex": "second" }, mainFile: "main.tex" },
      engine,
    );

    expect(load).toHaveBeenCalledTimes(1);
  });
});
