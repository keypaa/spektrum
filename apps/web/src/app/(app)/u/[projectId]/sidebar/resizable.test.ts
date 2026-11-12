// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { clampWidth, readStoredWidth, writeStoredWidth } from "./resizable";

afterEach(() => {
  localStorage.clear();
});

describe("clampWidth", () => {
  it("clamps below min and above max, keeps inside", () => {
    expect(clampWidth(100, 240, 480)).toBe(240);
    expect(clampWidth(600, 240, 480)).toBe(480);
    expect(clampWidth(300, 240, 480)).toBe(300);
    expect(clampWidth(NaN, 240, 480)).toBe(240);
  });
});

describe("readStoredWidth", () => {
  it("returns the stored value inside the range", () => {
    writeStoredWidth("k", 300);
    expect(readStoredWidth("k", 442, 240, 480)).toBe(300);
  });

  it("clamps a stored value outside the range", () => {
    writeStoredWidth("k", 600);
    expect(readStoredWidth("k", 442, 240, 480)).toBe(480);
    writeStoredWidth("k", 10);
    expect(readStoredWidth("k", 442, 240, 480)).toBe(240);
  });

  it("falls back to the fallback for corrupt JSON", () => {
    localStorage.setItem("k", "{not json");
    expect(readStoredWidth("k", 442, 240, 480)).toBe(442);
  });

  it("falls back when the key is absent", () => {
    expect(readStoredWidth("missing", 442, 240, 480)).toBe(442);
  });
});

describe("writeStoredWidth", () => {
  it("round-trips through localStorage", () => {
    writeStoredWidth("k", 350);
    expect(JSON.parse(localStorage.getItem("k")!)).toBe(350);
    expect(readStoredWidth("k", 442, 240, 480)).toBe(350);
  });
});