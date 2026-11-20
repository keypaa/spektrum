import { loadWebEnv } from "@spektrum/shared/env";
import { resolveLlmConfigForRequest } from "./keys";

export type ModelInfo = { id: string; label: string };

const CACHE_MS = 60_000;
const cache = new Map<string, { models: ModelInfo[]; expires: number }>();

/**
 * Resolve the gateway's model list for one user, with a 60 s cache.
 *
 * The key includes the endpoint and models, not just the user id: switching
 * provider in Settings must not keep serving the previous gateway's list.
 * Never throws: a gateway failure returns the configured (or env) defaults.
 */
export async function listModels(
  userId: string,
  role: string,
): Promise<ModelInfo[]> {
  const env = loadWebEnv();
  const resolved = await resolveLlmConfigForRequest(userId, role);
  const baseUrl = resolved?.baseUrl ?? env.llmBaseUrl;
  const models: ModelInfo[] = resolved
    ? [
        { id: resolved.chatModel, label: resolved.chatModel },
        { id: resolved.fastModel, label: resolved.fastModel },
      ]
    : [
        { id: env.llmModelChat, label: env.llmModelChat },
        { id: env.llmModelFast, label: env.llmModelFast },
      ];
  const fallback = models.filter((model, index) =>
    models.findIndex((m) => m.id === model.id) === index,
  );
  const cacheKey = `${userId}:${baseUrl}:${fallback.map((m) => m.id).join(",")}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.models;

  const store = (value: ModelInfo[]) => {
    if (cache.size >= 200) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(cacheKey, { models: value, expires: Date.now() + CACHE_MS });
  };

  if (!resolved) {
    store(fallback);
    return fallback;
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      redirect: "error",
      headers: { authorization: `Bearer ${resolved.key}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`models responded ${response.status}`);
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    const remote = (body.data ?? [])
      .map((model) => ({ id: model.id ?? "", label: model.id ?? "" }))
      .filter((model) => model.id.length > 0);
    const result = remote.length > 0 ? remote : fallback;
    store(result);
    return result;
  } catch {
    store(fallback);
    return fallback;
  }
}
