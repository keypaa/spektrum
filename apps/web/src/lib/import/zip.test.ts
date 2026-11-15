// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readZip, writeZip, ZipError, ZIP_LIMITS } from "./zip";

const enc = (s: string) => new TextEncoder().encode(s);

describe("zip", () => {
  it("round-trips entries", () => {
    const entries = readZip(writeZip([{ path: "a/b.tex", data: enc("hi") }]));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.path).toBe("a/b.tex");
    expect(new TextDecoder().decode(entries[0]!.data)).toBe("hi");
  });

  it("rejects a declared per-file size over the cap before inflating", () => {
    const zip = writeZip([{ path: "big.txt", data: new Uint8Array(4096) }]);
    expect(() => readZip(zip, { ...ZIP_LIMITS, maxFileBytes: 1024 })).toThrow(ZipError);
  });

  it("rejects an entry count over the cap", () => {
    const zip = writeZip(Array.from({ length: 4 }, (_, i) => ({ path: `f${i}.txt`, data: new Uint8Array(1) })));
    expect(() => readZip(zip, { ...ZIP_LIMITS, maxEntries: 2 })).toThrow(ZipError);
  });

  it("rejects a compressible entry over the per-file cap (declared size)", () => {
    const zip = writeZip([{ path: "zeros.bin", data: new Uint8Array(2 * 1024 * 1024) }]);
    expect(() => readZip(zip, { ...ZIP_LIMITS, maxFileBytes: 1024 })).toThrow(ZipError);
  });
});