// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  options: [] as Array<{ url: string; connections: number; duration: number }>,
  results: [] as Array<{ non2xx: number; latency: { p50: number; p95: number; p99: number }; throughput: { average: number } }>,
}));

vi.mock("autocannon", () => ({
  default: (
    options: { url: string; connections: number; duration: number },
    cb: (err: Error | null, result: unknown) => void,
  ) => {
    calls.options.push(options);
    const result = calls.results.shift() ?? {
      non2xx: 0,
      latency: { p50: 1, p95: 2, p99: 3 },
      throughput: { average: 100 },
    };
    setImmediate(() => cb(null, result));
    return { on: () => {} };
  },
}));

import { run } from "./loadtest";

const log = vi.spyOn(console, "log").mockImplementation(() => {});

beforeEach(() => {
  calls.options = [];
  calls.results = [];
  process.exitCode = 0;
  log.mockClear();
});

afterEach(() => {
  process.exitCode = 0;
});

describe("loadtest", () => {
  it("runs against /login and /api/health with 10 connections", async () => {
    const code = await run("http://localhost:3000");
    expect(code).toBe(0);
    expect(calls.options.map((o) => o.url)).toEqual([
      "http://localhost:3000/login",
      "http://localhost:3000/api/health",
    ]);
    expect(calls.options.every((o) => o.connections === 10)).toBe(true);
    expect(calls.options.every((o) => o.duration === 10)).toBe(true);
  });

  it("reports latency percentiles", async () => {
    await run("http://localhost:3000");
    const printed = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toContain("p50");
    expect(printed).toContain("p95");
    expect(printed).toContain("p99");
  });

  it("exits non-zero when any response is not 2xx", async () => {
    calls.results = [
      { non2xx: 0, latency: { p50: 1, p95: 2, p99: 3 }, throughput: { average: 100 } },
      { non2xx: 5, latency: { p50: 1, p95: 2, p99: 3 }, throughput: { average: 100 } },
    ];
    const code = await run("http://localhost:3000");
    expect(code).toBe(1);
  });
});