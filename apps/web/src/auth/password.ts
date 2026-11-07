// Argon2id password hashing — spec §10.4.
// Parameters: m=19456, t=2, p=1, 16-byte salt, 32-byte output (spec §3.2).
// Wired into Better Auth in Task 7 so every password path uses Argon2id.
import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { COMMON_PASSWORDS } from "@spektrum/shared/common-passwords";

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, {
    ...ARGON2_OPTIONS,
    salt: randomBytes(16),
  });
}

export async function verifyPassword(
  hashStr: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(hashStr, plain);
  } catch {
    // malformed hash — never throw, just reject
    return false;
  }
}

export type PasswordValidation =
  | { ok: true }
  | { ok: false; reason: string };

export function validatePassword(plain: string): PasswordValidation {
  if (plain.length < 12) {
    return { ok: false, reason: "At least 12 characters" };
  }
  if (COMMON_PASSWORDS.has(plain.toLowerCase())) {
    return { ok: false, reason: "This password is too common" };
  }
  return { ok: true };
}
