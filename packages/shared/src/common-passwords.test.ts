import { describe, expect, it } from "vitest";
import { COMMON_PASSWORDS } from "./common-passwords";

describe("COMMON_PASSWORDS (top 10k deny-list)", () => {
  it("has ~10k entries", () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(9_900);
    expect(COMMON_PASSWORDS.size).toBeLessThanOrEqual(10_100);
  });

  it("contains the classic top entries", () => {
    for (const p of ["password", "123456", "qwerty", "letmein", "iloveyou"]) {
      expect(COMMON_PASSWORDS.has(p), p).toBe(true);
    }
  });

  it("is entirely lowercase", () => {
    for (const p of COMMON_PASSWORDS) {
      expect(p).toBe(p.toLowerCase());
    }
  });
});
