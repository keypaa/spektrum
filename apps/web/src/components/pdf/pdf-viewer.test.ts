// @vitest-environment node
// "Zoom to fit" used to be `onZoom(100)` — a hardcoded 100% that happened to
// look right at one window width and did nothing at any other. The arithmetic
// is pure, so it is tested directly.
import { describe, expect, it } from "vitest";
import { fitPercent } from "./pdf-viewer";

describe("fitPercent", () => {
  it("fits a 595 pt A4 page into a 677 px viewport", () => {
    // (677 - 16 padding - 1 safety) / 595 = 110.7% -> 110
    expect(fitPercent(677, 595)).toBe(110);
  });

  it("fits a 612 pt page into a 661 px viewport without overflowing", () => {
    // 644 / 612 = 105.2% -> 105; 612 * 1.05 = 642.6 <= 644 available
    const percent = fitPercent(661, 612)!;
    expect(percent).toBe(105);
    expect(612 * (percent / 100)).toBeLessThanOrEqual(661 - 16);
  });

  it("never rounds up past the content box", () => {
    // The case that produced a horizontal scrollbar: rounding 105.83% up to
    // 106 made the page 1 px wider than the 630 px available.
    const container = 646; // 661 clientWidth minus a 15 px vertical scrollbar
    const percent = fitPercent(container, 595)!;
    expect(percent).toBe(105);
    expect(595 * (percent / 100)).toBeLessThanOrEqual(container - 16);
  });

  it("returns a larger percentage for a narrow pane", () => {
    expect(fitPercent(417, 595)).toBe(67);
  });

  it("returns null when either measurement is missing", () => {
    expect(fitPercent(0, 612)).toBeNull();
    expect(fitPercent(677, 0)).toBeNull();
    expect(fitPercent(Number.NaN, 612)).toBeNull();
  });
});