import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSyncTex } from "./synctex";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "synctex",
  "example.synctex.gz",
);

describe("parseSyncTex", () => {
  it("maps a project file's line to a page and 0–1 fractions", () => {
    const map = parseSyncTex(readFileSync(fixture), [
      { width: 612, height: 792 },
    ]);
    const entries = map.forward["main.tex"];
    expect(entries?.length).toBeGreaterThan(0);
    const first = entries![0]!;
    expect(first.page).toBe(1);
    expect(first.x).toBeGreaterThanOrEqual(0);
    expect(first.x).toBeLessThanOrEqual(1);
    expect(first.y).toBeGreaterThanOrEqual(0);
    expect(first.y).toBeLessThanOrEqual(1);
    expect(first.line).toBeGreaterThan(0);
  });

  it("builds backward anchors per page, ordered by y", () => {
    const map = parseSyncTex(readFileSync(fixture), [
      { width: 612, height: 792 },
    ]);
    expect(map.backward.length).toBe(1);
    const anchors = map.backward[0]!.anchors;
    expect(anchors.length).toBeGreaterThan(0);
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i]!.y).toBeGreaterThanOrEqual(anchors[i - 1]!.y);
    }
  });

  it("ignores package files (absolute paths outside /work)", () => {
    const map = parseSyncTex(readFileSync(fixture), [
      { width: 612, height: 792 },
    ]);
    expect(Object.keys(map.forward).some((p) => p.startsWith("/usr/"))).toBe(
      false,
    );
  });

  it("degrades to an empty map for an empty file", () => {
    const empty = gzipSync(
      Buffer.from("SyncTeX Version:1\nInput:1:/work/./main.tex\nContent:\n"),
    );
    const map = parseSyncTex(empty, [{ width: 612, height: 792 }]);
    expect(map.forward).toEqual({});
    expect(map.backward).toEqual([]);
  });
});