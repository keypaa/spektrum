// Provider catalog for BYOK AI settings (spec §12.2).
//
// Every provider here speaks the OpenAI-compatible `/chat/completions` API the
// gateway already uses. The catalog only supplies defaults — the provider,
// endpoint and model names are all editable in Settings, including a fully
// custom endpoint for self-hosted or lesser-known gateways.

export interface AiProvider {
  id: string;
  label: string;
  baseUrl: string;
  models: readonly string[];
  defaultModel: string;
  defaultFastModel: string;
  keyPlaceholder: string;
}

export const CUSTOM_PROVIDER_ID = "custom";

export const AI_PROVIDERS: readonly AiProvider[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o4-mini"],
    defaultModel: "gpt-4.1",
    defaultFastModel: "gpt-4.1-mini",
    keyPlaceholder: "sk-…",
  },
  {
    id: "kilo",
    label: "Kilo Code",
    baseUrl: "https://api.kilo.ai/api/gateway",
    models: [
      "kilo-auto/free",
      "kilo-auto/efficient",
      "baidu/ernie-5.5-flash-preview:free",
      "openai/gpt-4.1",
      "deepseek/deepseek-chat",
    ],
    defaultModel: "baidu/ernie-5.5-flash-preview:free",
    defaultFastModel: "baidu/ernie-5.5-flash-preview:free",
    keyPlaceholder: "Kilo Code API key (JWT)",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      "openai/gpt-4o",
      "anthropic/claude-3.7-sonnet",
      "deepseek/deepseek-chat",
      "google/gemini-2.5-flash",
    ],
    defaultModel: "openai/gpt-4o",
    defaultFastModel: "google/gemini-2.5-flash",
    keyPlaceholder: "sk-or-…",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    defaultFastModel: "deepseek-chat",
    keyPlaceholder: "sk-…",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    defaultModel: "llama-3.3-70b-versatile",
    defaultFastModel: "llama-3.1-8b-instant",
    keyPlaceholder: "gsk_…",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    baseUrl: "https://api.mistral.ai/v1",
    models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
    defaultModel: "mistral-large-latest",
    defaultFastModel: "mistral-small-latest",
    keyPlaceholder: "API key",
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "meta-llama/Llama-3.1-8B-Instruct-Turbo",
    ],
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    defaultFastModel: "meta-llama/Llama-3.1-8B-Instruct-Turbo",
    keyPlaceholder: "API key",
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    models: [
      "accounts/fireworks/models/llama-v3p3-70b-instruct",
      "accounts/fireworks/models/llama-v3p1-8b-instruct",
    ],
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    defaultFastModel: "accounts/fireworks/models/llama-v3p1-8b-instruct",
    keyPlaceholder: "API key",
  },
  {
    id: "xai",
    label: "xAI",
    baseUrl: "https://api.x.ai/v1",
    models: ["grok-3", "grok-3-mini"],
    defaultModel: "grok-3",
    defaultFastModel: "grok-3-mini",
    keyPlaceholder: "xai-…",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    defaultModel: "gemini-2.5-pro",
    defaultFastModel: "gemini-2.5-flash",
    keyPlaceholder: "API key",
  },
  {
    id: "qwen",
    label: "Qwen / DashScope",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-max", "qwen-turbo"],
    defaultModel: "qwen-plus",
    defaultFastModel: "qwen-turbo",
    keyPlaceholder: "sk-…",
  },
  {
    id: CUSTOM_PROVIDER_ID,
    label: "Custom endpoint",
    baseUrl: "",
    models: [],
    defaultModel: "",
    defaultFastModel: "",
    keyPlaceholder: "API key",
  },
];

export function findProvider(id: string): AiProvider | undefined {
  return AI_PROVIDERS.find((provider) => provider.id === id);
}

const PRIVATE_V4 =
  /^(10|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168|100\.(6[4-9]|[7-9]\d|1(?:[01]\d|2[0-7])))\./;
const METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

/**
 * Validate a user-supplied gateway URL before the server sends a Bearer token
 * to it. `http:` is allowed only for a local model server; remote endpoints
 * must be https, and private/link-local/metadata targets are refused.
 *
 * This blocks the obvious SSRF vectors, but it is not a DNS-rebinding defence —
 * a hostname can still resolve to a private address after this check.
 */
export function validateBaseUrl(value: string): { ok: true } | { ok: false; reason: string } {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, reason: "Endpoint must use http or https" };
    }
    if (url.username || url.password) {
      return { ok: false, reason: "Endpoint must not contain credentials" };
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
    if (!host) return { ok: false, reason: "Endpoint needs a host" };
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (
      (PRIVATE_V4.test(host) && !loopback) ||
      /^f[cd][0-9a-f]|^fe[89ab]/i.test(host) ||
      METADATA_HOSTS.has(host) ||
      host.endsWith(".internal")
    ) {
      return { ok: false, reason: "Private and metadata endpoints are not allowed" };
    }
    if (url.protocol === "http:" && !loopback) {
      return { ok: false, reason: "Remote endpoints must use https" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "Enter a valid endpoint URL" };
  }
}
