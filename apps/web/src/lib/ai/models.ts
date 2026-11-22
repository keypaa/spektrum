import { loadWebEnv } from "@spektrum/shared/env";
import { resolveLlmConfigForRequest } from "./keys";
import { detectImageSupport, type ImageSupport } from "./model-capabilities";

export type ModelInfo = {
  id: string;
  label: string;
  imageSupport: ImageSupport;
};

/** Fallback entries carry no catalog metadata, so only the id can speak. */
function fromConfiguredId(id: string): ModelInfo {
  return { id, label: id, imageSupport: detectImageSupport({}, id) };
}

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
    ? [fromConfiguredId(resolved.chatModel), fromConfiguredId(resolved.fastModel)]
    : [fromConfiguredId(env.llmModelChat), fromConfiguredId(env.llmModelFast)];
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
    const body = (await response.json()) as { data?: unknown };
    const remote = (Array.isArray(body.data) ? body.data : [])
      .map((model) =>
        typeof model === "object" && model !== null
          ? (model as Record<string, unknown>)
          : undefined,
      )
      .flatMap((raw) => {
        const id = typeof raw?.id === "string" ? raw.id : "";
        if (id.length === 0) return [];
        return [
          { id, label: id, imageSupport: detectImageSupport(raw ?? {}, id) },
        ];
      });
    const result = remote.length > 0 ? remote : fallback;
    store(result);
    return result;
  } catch {
    store(fallback);
    return fallback;
  }
}
