// @vitest-environment node
// "Zoom to fit" used to be `onZoom(100)` — a hardcoded 100% that happened to
// look right at one window width and did nothing at any other. The arithmetic
// is pure, so it is tested directly. `containerWidth` is the viewport's
// offsetWidth (outer width, including padding and the scrollbar track).
import { describe, expect, it } from "vitest";
import {
  currentPageFromScroll,
  fitPercent,
  pageScrollTarget,
} from "./pdf-viewer";

describe("currentPageFromScroll", () => {
  const offsets: Array<readonly [number, number]> = [
    [1, 8],
    [2, 1200],
    [3, 2400],
  ];

  it("reports the page whose top has passed the viewport", () => {
    expect(currentPageFromScroll(offsets, 0)).toBe(1);
    expect(currentPageFromScroll(offsets, 1190)).toBe(1);
    expect(currentPageFromScroll(offsets, 1200)).toBe(2);
    expect(currentPageFromScroll(offsets, 2500)).toBe(3);
  });
});

describe("pageScrollTarget", () => {
  it("leaves a small gutter and never scrolls above the first page", () => {
    expect(pageScrollTarget(1200)).toBe(1192);
    expect(pageScrollTarget(4)).toBe(0);
  });
});

describe("fitPercent", () => {
  it("fits a 595 pt A4 page into a 677 px viewport", () => {
    // (677 - 16 padding - 16 scrollbar - 1 safety) / 595 = 108.2% -> 108
    expect(fitPercent(677, 595)).toBe(108);
  });

  it("fits a 612 pt page into a 661 px viewport without overflowing", () => {
    // 628 / 612 = 102.6% -> 102; 612 * 1.02 = 624.24 <= 630 available
    const percent = fitPercent(661, 612)!;
    expect(percent).toBe(102);
    expect(612 * (percent / 100)).toBeLessThanOrEqual(661 - 16 - 15);
  });

  it("never rounds up past the content box", () => {
    // Rounding up can land a fraction of a pixel over the available width,
    // which is exactly enough to raise a horizontal scrollbar.
    const offsetWidth = 661;
    const percent = fitPercent(offsetWidth, 595)!;
    expect(percent).toBe(105);
    expect(595 * (percent / 100)).toBeLessThanOrEqual(offsetWidth - 16 - 15);
  });

  it("reserves the vertical scrollbar that appears after fitting", () => {
    // `containerWidth` is offsetWidth: it includes the scrollbar track even
    // when the current page is short enough not to show one. Fitting against
    // clientWidth leaves ~15 px too little once the fitted page gets taller
    // and the vertical scrollbar appears — the horizontal scrollbar bug.
    const offsetWidth = 677;
    const percent = fitPercent(offsetWidth, 595)!;
    const contentAfterFit = offsetWidth - 16 /* padding */ - 15 /* scrollbar */;
    expect(595 * (percent / 100)).toBeLessThanOrEqual(contentAfterFit);
  });

  it("returns a larger percentage for a narrow pane", () => {
    expect(fitPercent(417, 595)).toBe(64);
  });

  it("returns null when either measurement is missing", () => {
    expect(fitPercent(0, 612)).toBeNull();
    expect(fitPercent(677, 0)).toBeNull();
    expect(fitPercent(Number.NaN, 612)).toBeNull();
  });
});
