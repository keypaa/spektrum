import { describe, expect, it } from "vitest";
import { nearestAnchor } from "./use-sync-jump";
import { nearestForward } from "./use-sync-scroll";

const anchors = [
  { y: 0.2, path: "main.tex", line: 10 },
  { y: 0.5, path: "main.tex", line: 20 },
  { y: 0.75, path: "main.tex", line: 30 },
];

describe("nearestAnchor", () => {
  it("picks the nearest anchor by y", () => {
    expect(nearestAnchor(anchors, 0.55)).toEqual(anchors[1]);
    expect(nearestAnchor(anchors, 0.1)).toEqual(anchors[0]);
    expect(nearestAnchor(anchors, 0.9)).toEqual(anchors[2]);
  });

  it("returns null for an empty page", () => {
    expect(nearestAnchor([], 0.5)).toBeNull();
  });
});

describe("nearestForward", () => {
  const entries = [
    { line: 10, page: 1, x: 0.1, y: 0.2 },
    { line: 20, page: 2, x: 0.2, y: 0.5 },
    { line: 30, page: 2, x: 0.3, y: 0.75 },
  ];

  it("picks the nearest line", () => {
    expect(nearestForward(entries, 21)?.line).toBe(20);
    expect(nearestForward(entries, 9)?.line).toBe(10);
    expect(nearestForward(undefined, 5)).toBeNull();
  });
});