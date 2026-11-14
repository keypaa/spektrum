import { resolveLlmKey } from "@/auth/llm-key";
import { loadWebEnv } from "@spektrum/shared/env";

export type ResolvedLlmKey = {
  key: string;
  source: "user" | "server";
};

/**
 * The key used for one request: the caller's BYOK key first, then the
 * owner-only server key. Never returns a key to the client.
 */
export async function resolveLlmKeyForRequest(
  userId: string,
  role: string,
): Promise<ResolvedLlmKey | null> {
  const userKey = await resolveLlmKey(userId);
  if (userKey) return { key: userKey, source: "user" };

  if (role === "owner") {
    const serverKey = loadWebEnv().llmApiKey;
    if (serverKey) return { key: serverKey, source: "server" };
  }

  return null;
}