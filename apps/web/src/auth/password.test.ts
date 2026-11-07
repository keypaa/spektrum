import { describe, expect, it } from "vitest";
import { hashPassword, validatePassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("round-trips a password", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword(h, "correct horse battery staple")).resolves.toBe(true);
    await expect(verifyPassword(h, "wrong password entirely")).resolves.toBe(false);
  });

  it("uses the spec's argon2 parameters", async () => {
    const h = await hashPassword("another long password");
    expect(h).toMatch(/m=19456,t=2,p=1/);
  });

  it("never throws on a malformed hash", async () => {
    await expect(verifyPassword("not-a-hash", "whatever")).resolves.toBe(false);
    await expect(verifyPassword("", "whatever")).resolves.toBe(false);
  });
});

describe("validatePassword", () => {
  it("rejects short passwords", () => {
    expect(validatePassword("short")).toEqual({
      ok: false,
      reason: "At least 12 characters",
    });
    expect(validatePassword("twelve chars")).toEqual({ ok: true });
  });

  it("rejects the top common passwords even when long enough", () => {
    expect(validatePassword("passwordpassword").ok).toBe(false);
  });
});
