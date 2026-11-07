// Envelope encryption for BYOK LLM keys — spec §12.2.
// AES-256-GCM, 12-byte random nonce, 16-byte auth tag.
// Wire format: base64( nonce(12) || tag(16) || ciphertext ).
// The AAD binds each ciphertext to its record (user id), so a sealed key
// cannot be replayed against another user even if the DB leaks.
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const NONCE_LEN = 12;
const TAG_LEN = 16;
const KEK_SALT = "spektrum-kek-v1"; // KDF salt; the secret itself is the entropy

/** Derive a stable 32-byte key-encryption key from LLM_KEY_ENCRYPTION_SECRET. */
export function deriveKey(secret: string): Buffer {
  return scryptSync(secret, KEK_SALT, 32);
}

export function sealSecret(plain: string, aad: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("sealSecret: key must be 32 bytes");
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, ciphertext]).toString("base64");
}

export function openSecret(sealed: string, aad: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("openSecret: key must be 32 bytes");
  const raw = Buffer.from(sealed, "base64");
  if (raw.length < NONCE_LEN + TAG_LEN + 1) {
    throw new Error("openSecret: malformed sealed value");
  }
  const nonce = raw.subarray(0, NONCE_LEN);
  const tag = raw.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN);
  const ciphertext = raw.subarray(NONCE_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new Error("openSecret: authentication failed (wrong key, AAD, or tampered data)");
  }
}

export function last4(plain: string): string {
  return plain.slice(-4);
}
