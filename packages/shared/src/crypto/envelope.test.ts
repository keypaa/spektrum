import { describe, expect, it } from "vitest";
import { sealSecret, openSecret, last4, deriveKey } from "./envelope";

const KEY = Buffer.alloc(32, 7);
const AAD = "user:6f1c8a2e-0000-4000-8000-000000000000";

describe("sealSecret/openSecret", () => {
  it("round-trips and never contains the plaintext", () => {
    const sealed = sealSecret("sk-live-abcdef123456", AAD, KEY);
    expect(sealed).not.toContain("sk-live");
    expect(sealed).not.toContain("abcdef");
    expect(openSecret(sealed, AAD, KEY)).toBe("sk-live-abcdef123456");
  });

  it("uses a fresh nonce per seal (same input seals differently)", () => {
    const a = sealSecret("sk-live-abcdef123456", AAD, KEY);
    const b = sealSecret("sk-live-abcdef123456", AAD, KEY);
    expect(a).not.toBe(b);
    expect(openSecret(a, AAD, KEY)).toBe("sk-live-abcdef123456");
    expect(openSecret(b, AAD, KEY)).toBe("sk-live-abcdef123456");
  });

  it("fails when the AAD changes (key bound to a user)", () => {
    const sealed = sealSecret("sk-live-abcdef123456", AAD, KEY);
    expect(() => openSecret(sealed, "user:other", KEY)).toThrow();
  });

  it("fails when the key changes", () => {
    const sealed = sealSecret("sk-live-abcdef123456", AAD, KEY);
    const otherKey = Buffer.alloc(32, 9);
    expect(() => openSecret(sealed, AAD, otherKey)).toThrow();
  });

  it("fails when the ciphertext is tampered with", () => {
    const sealed = sealSecret("sk-live-abcdef123456", AAD, KEY);
    const bytes = Buffer.from(sealed, "base64");
    const last = bytes.length - 1;
    bytes[last] = (bytes[last] ?? 0) ^ 0xff;
    expect(() => openSecret(bytes.toString("base64"), AAD, KEY)).toThrow();
  });

  it("fails on malformed input", () => {
    expect(() => openSecret("not-base64!!!", AAD, KEY)).toThrow();
    expect(() => openSecret("aGVsbG8=", AAD, KEY)).toThrow(); // too short
  });
});

describe("deriveKey", () => {
  it("derives a stable 32-byte key from the secret", () => {
    const a = deriveKey("some-32+-char-encryption-secret!!!");
    const b = deriveKey("some-32+-char-encryption-secret!!!");
    expect(a).toHaveLength(32);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(deriveKey("different-secret-000000000000000"))).toBe(false);
  });
});

describe("last4", () => {
  it("returns the last 4 characters", () => {
    expect(last4("sk-live-abcdef123456")).toBe("3456");
    expect(last4("short")).toBe("hort");
  });
});
