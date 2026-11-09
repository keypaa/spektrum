// Password-reset token lifecycle — spec §10.2: reset via single-use token,
// 30-minute TTL, hash stored, invalidated on use *and on password change*.
//
// Better Auth owns the reset endpoints and consumes the token on use, but it
// does not clear the user's other outstanding reset tokens when the password
// changes. The wrappers at /api/auth/reset-password and
// /api/auth/change-password call clearOutstandingResetTokens after a
// successful write.
//
// Identifiers are hashed via `hashResetIdentifier` (wired into auth.ts as a
// `storeIdentifier` override). The visible `reset-password:` prefix keeps the
// rows selectable per user; the secret token itself is only stored as SHA-256.
// Verification rows also live in Postgres (`verification.storeInDatabase`), so
// the DB is the store of record and a stale Redis cache entry cannot redeem a
// token whose row is gone.
import { createHash } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { db } from "@spektrum/db";
import { verifications } from "@spektrum/db/schema";

export const RESET_TOKEN_PREFIX = "reset-password:";

/** SHA-256 of the secret part, keeping the purpose prefix searchable. */
export async function hashResetIdentifier(identifier: string): Promise<string> {
  const token = identifier.startsWith(RESET_TOKEN_PREFIX)
    ? identifier.slice(RESET_TOKEN_PREFIX.length)
    : identifier;
  const digest = createHash("sha256").update(token).digest("base64url");
  return `${RESET_TOKEN_PREFIX}${digest}`;
}

export async function clearOutstandingResetTokens(
  userId: string,
): Promise<void> {
  await db
    .delete(verifications)
    .where(
      and(
        eq(verifications.value, userId),
        like(verifications.identifier, `${RESET_TOKEN_PREFIX}%`),
      ),
    );
}

/** Resolve the user a reset token belongs to, without consuming it. */
export async function findResetTokenUserId(
  token: string,
): Promise<string | null> {
  const identifier = await hashResetIdentifier(`${RESET_TOKEN_PREFIX}${token}`);
  const rows = await db
    .select()
    .from(verifications)
    .where(eq(verifications.identifier, identifier))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt < new Date()) return null;
  return row.value;
}
