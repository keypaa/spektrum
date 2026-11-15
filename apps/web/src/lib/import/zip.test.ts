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

  it("writes identical bytes for identical input, so the archive hash is stable", () => {
    // A timestamp in the header would make two exports of the same content hash
    // differently, and re-importing one would not be seen as a duplicate.
    const files = [{ path: "a.txt", data: enc("same") }];
    const first = writeZip(files);
    const second = writeZip(files);
    expect(Buffer.compare(Buffer.from(first), Buffer.from(second))).toBe(0);
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

  // The declared size in the header is attacker-controlled. fflate reads it
  // from the local file header (offset 22), so patching that field makes the
  // archive claim a size it does not have. Only the *actual* inflated byte
  // counter can catch it.
  it("rejects an entry that inflates past the cap when the header understates it", () => {
    const zip = writeZip([{ path: "forged.bin", data: new Uint8Array(4096) }]);
    const forged = zip.slice();
    new DataView(forged.buffer, forged.byteOffset, forged.byteLength).setUint32(22, 10, true);

    // The declared size (10) is under the cap, so only the actual-byte
    // counter can reject this.
    expect(() => readZip(forged, { ...ZIP_LIMITS, maxFileBytes: 1024 })).toThrow(ZipError);
  });

  it("rejects an archive whose total inflated size exceeds the cap", () => {
    const zip = writeZip([
      { path: "a.bin", data: new Uint8Array(2048) },
      { path: "b.bin", data: new Uint8Array(2048) },
    ]);
    expect(() =>
      readZip(zip, { ...ZIP_LIMITS, maxFileBytes: 100_000, maxTotalBytes: 3000 }),
    ).toThrow(ZipError);
  });

  it("refuses to write two entries with the same path", () => {
    // A zip is keyed by path: a duplicate would silently overwrite the first
    // entry, so an "export everything" archive could lose a project's files.
    expect(() =>
      writeZip([
        { path: "a/main.tex", data: enc("one") },
        { path: "a/main.tex", data: enc("two") },
      ]),
    ).toThrow(ZipError);
  });

  it("rejects an entry whose compression ratio exceeds the cap", () => {
    // 4096 zero bytes compress to a few dozen bytes: a ratio far above 100.
    const zip = writeZip([{ path: "bomb.bin", data: new Uint8Array(4096) }]);
    expect(() =>
      readZip(zip, { ...ZIP_LIMITS, maxFileBytes: 1_000_000, maxRatio: 100 }),
    ).toThrow(ZipError);
  });

  it("reports which cap was crossed", () => {
    const zip = writeZip([{ path: "big.txt", data: new Uint8Array(4096) }]);
    try {
      readZip(zip, { ...ZIP_LIMITS, maxFileBytes: 1024 });
      expect.unreachable("readZip should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ZipError);
      expect((e as ZipError).code).toBe("too_large");
    }
  });
});