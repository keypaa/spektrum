// BYOK LLM key storage — spec §12.2.
// users.llm_api_key_ciphertext holds sealSecret(apiKey, aad=`user:<id>`, KEK);
// llm_api_key_last4 holds the last 4 chars for the UI (sk-…abcd).
// The plaintext is NEVER returned by getLlmKeyStatus; only resolveLlmKey
// (server-side, inside /api/llm/* proxies) decrypts.
import { eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import { loadWebEnv } from "@spektrum/shared/env";
import { deriveKey, sealSecret, openSecret, last4 } from "@spektrum/shared/crypto/envelope";

let _kek: Buffer | undefined;
function kek(): Buffer {
  return (_kek ??= deriveKey(loadWebEnv().llmKeyEncryptionSecret));
}

export type ApiKeyValidation = { ok: true } | { ok: false; reason: string };

export function validateApiKeyShape(apiKey: string): ApiKeyValidation {
  if (apiKey.length < 20) return { ok: false, reason: "API key is too short" };
  if (apiKey.length > 200) return { ok: false, reason: "API key is too long" };
  if (/\s/.test(apiKey)) return { ok: false, reason: "API key must not contain whitespace" };
  return { ok: true };
}

export async function saveLlmKey(userId: string, apiKey: string): Promise<void> {
  const check = validateApiKeyShape(apiKey);
  if (!check.ok) throw new Error(check.reason);
  await db
    .update(users)
    .set({
      llmApiKeyCiphertext: sealSecret(apiKey, `user:${userId}`, kek()),
      llmApiKeyLast4: last4(apiKey),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function getLlmKeyStatus(
  userId: string,
): Promise<{ configured: boolean; last4?: string | undefined }> {
  const rows = await db
    .select({
      ct: users.llmApiKeyCiphertext,
      l4: users.llmApiKeyLast4,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row?.ct) return { configured: false };
  return { configured: true, last4: row.l4 ?? undefined };
}

export async function deleteLlmKey(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      llmApiKeyCiphertext: null,
      llmApiKeyLast4: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/** Server-side only: decrypt the user's key. Never call from a route that
 *  serialises its result to the client. */
export async function resolveLlmKey(userId: string): Promise<string | null> {
  const rows = await db
    .select({ ct: users.llmApiKeyCiphertext })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const ct = rows[0]?.ct;
  if (!ct) return null;
  return openSecret(ct, `user:${userId}`, kek());
}
