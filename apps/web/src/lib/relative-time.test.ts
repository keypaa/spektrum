import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

const NOW = new Date("2026-11-09T12:00:00Z");
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe("relativeTime", () => {
  const cases: Array<[number, string]> = [
    [30 * SECOND, "now"],
    [59 * SECOND, "now"],
    [60 * SECOND, "1m"],
    [59 * MINUTE, "59m"],
    [60 * MINUTE, "1h"],
    [23 * HOUR, "23h"],
    [24 * HOUR, "1d"],
    [2 * DAY, "2d"],
    [30 * DAY, "30d"],
    [31 * DAY, "1mo"],
    [183 * DAY, "6mo"],
    [274 * DAY, "9mo"],
    [365 * DAY, "1yr"],
    [730 * DAY, "2yr"],
  ];

  it.each(cases)("%i ms ago renders %s", (offset, expected) => {
    expect(relativeTime(ago(offset), NOW)).toBe(expected);
  });

  it("is pure and clamps future timestamps to now", () => {
    const from = ago(31 * DAY);
    const before = from.getTime();

    expect(relativeTime(from, NOW)).toBe("1mo");
    expect(relativeTime(from, NOW)).toBe("1mo");
    expect(from.getTime()).toBe(before);

    // A timestamp in the future must never yield a negative value.
    expect(relativeTime(new Date(NOW.getTime() + 90 * DAY), NOW)).toBe("now");
  });
});
