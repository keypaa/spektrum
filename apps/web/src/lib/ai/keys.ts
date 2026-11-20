import { resolveLlmKey } from "@/auth/llm-key";
import { loadWebEnv } from "@spektrum/shared/env";
import { findProvider, validateBaseUrl } from "@spektrum/shared/ai";
import type { Preferences } from "@spektrum/shared/preferences";
import { getPreferences } from "@/lib/preferences";

export type ResolvedLlmKey = {
  key: string;
  source: "user" | "server";
};

export type EffectiveLlmConfig = {
  configured: boolean;
  providerId: string;
  baseUrl: string;
  chatModel: string;
  fastModel: string;
};

export type ResolvedLlmConfig = ResolvedLlmKey &
  Omit<EffectiveLlmConfig, "configured" | "providerId">;

/** Server-safe view of the active models — never includes the API key. */
export function effectiveLlmConfig(
  llm: Preferences["llm"],
  env = loadWebEnv(),
): EffectiveLlmConfig {
  // Endpoint and models resolve independently: leaving the endpoint blank on
  // a known provider uses that provider's catalog URL while still honouring
  // the model the user typed.
  const endpoint = llm.baseUrl || findProvider(llm.providerId)?.baseUrl || env.llmBaseUrl;
  const endpointOk = validateBaseUrl(endpoint).ok;
  const modelsSet = Boolean(llm.chatModel && llm.fastModel);
  return {
    configured: llm.configured && modelsSet && endpointOk,
    providerId: llm.providerId,
    baseUrl: endpointOk ? endpoint : env.llmBaseUrl,
    chatModel: llm.configured && llm.chatModel ? llm.chatModel : env.llmModelChat,
    fastModel: llm.configured && llm.fastModel ? llm.fastModel : env.llmModelFast,
  };
}

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

/**
 * Resolve the key together with the provider endpoint and models for one
 * request. Until the user configures AI settings in Preferences, the existing
 * server env values are used — so deployments keep working unchanged.
 */
export async function resolveLlmConfigForRequest(
  userId: string,
  role: string,
): Promise<ResolvedLlmConfig | null> {
  const resolved = await resolveLlmKeyForRequest(userId, role);
  if (!resolved) return null;
  const env = loadWebEnv();
  const { llm } = await getPreferences(userId);
  const effective = effectiveLlmConfig(llm, env);
  // The deployment-wide key belongs to the deployment's own gateway. An owner
  // must never send it to a URL they typed in Settings.
  const safe =
    resolved.source === "server"
      ? {
          // Use the env values verbatim. Feeding default preferences through
          // effectiveLlmConfig would pick the default provider's catalog URL
          // instead of the deployment's configured gateway.
          baseUrl: env.llmBaseUrl,
          chatModel: env.llmModelChat,
          fastModel: env.llmModelFast,
        }
      : effective;
  return {
    ...resolved,
    baseUrl: safe.baseUrl,
    chatModel: safe.chatModel,
    fastModel: safe.fastModel,
  };
}