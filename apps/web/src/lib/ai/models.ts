import { loadWebEnv } from "@spektrum/shared/env";
import { resolveLlmKeyForRequest } from "./keys";

export type ModelInfo = { id: string; label: string };

const CACHE_MS = 60_000;
const cache = new Map<string, { models: ModelInfo[]; expires: number }>();

/**
 * Resolve the gateway's model list for one user, with a 60 s per-user cache.
 * Never throws: a gateway failure returns the env defaults.
 */
export async function listModels(
  userId: string,
  role: string,
): Promise<ModelInfo[]> {
  const cached = cache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.models;

  const env = loadWebEnv();
  const fallback: ModelInfo[] = [
    { id: env.llmModelChat, label: env.llmModelChat },
    { id: env.llmModelFast, label: env.llmModelFast },
  ];
  const resolved = await resolveLlmKeyForRequest(userId, role);
  if (!resolved) {
    cache.set(userId, { models: fallback, expires: Date.now() + CACHE_MS });
    return fallback;
  }

  try {
    const response = await fetch(
      `${env.llmBaseUrl.replace(/\/$/, "")}/models`,
      {
        headers: { authorization: `Bearer ${resolved.key}` },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) throw new Error(`models responded ${response.status}`);
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = (body.data ?? [])
      .map((model) => ({ id: model.id ?? "", label: model.id ?? "" }))
      .filter((model) => model.id.length > 0);
    const result = models.length > 0 ? models : fallback;
    cache.set(userId, { models: result, expires: Date.now() + CACHE_MS });
    return result;
  } catch {
    cache.set(userId, { models: fallback, expires: Date.now() + CACHE_MS });
    return fallback;
  }
}