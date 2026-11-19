// @vitest-environment node
// "Zoom to fit" used to be `onZoom(100)` — a hardcoded 100% that happened to
// look right at one window width and did nothing at any other. The arithmetic
// is pure, so it is tested directly.
import { describe, expect, it } from "vitest";
import { fitPercent } from "./pdf-viewer";

describe("fitPercent", () => {
  it("fits a 612 pt page into a 677 px viewport minus padding", () => {
    // (677 - 16) / 612 = 108%
    expect(fitPercent(677, 612)).toBe(108);
  });

  it("returns a larger percentage for a narrow viewport", () => {
    expect(fitPercent(417, 612)).toBe(66);
  });

  it("returns null when either measurement is missing", () => {
    expect(fitPercent(0, 612)).toBeNull();
    expect(fitPercent(677, 0)).toBeNull();
    expect(fitPercent(Number.NaN, 612)).toBeNull();
  });
});