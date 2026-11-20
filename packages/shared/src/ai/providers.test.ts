import { describe, expect, it } from "vitest";
import {
  AI_PROVIDERS,
  CUSTOM_PROVIDER_ID,
  findProvider,
  validateBaseUrl,
} from "./providers";

describe("AI provider catalog", () => {
  it("offers a broad list including the common gateways and a custom endpoint", () => {
    const ids = AI_PROVIDERS.map((p) => p.id);
    for (const id of [
      "openai",
      "kilo",
      "openrouter",
      "deepseek",
      "groq",
      "mistral",
      "together",
      "fireworks",
      "xai",
      "gemini",
      "qwen",
      "custom",
    ]) {
      expect(ids, id).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("pre-fills a usable base URL and models for known providers", () => {
    for (const provider of AI_PROVIDERS) {
      if (provider.id === CUSTOM_PROVIDER_ID) continue;
      expect(provider.baseUrl, provider.id).toMatch(/^https:\/\//);
      expect(provider.models.length, provider.id).toBeGreaterThan(0);
      expect(provider.models, provider.id).toContain(provider.defaultModel);
    }
  });

  it("finds a provider by id and returns undefined for unknown ids", () => {
    expect(findProvider("kilo")?.label).toBe("Kilo Code");
    expect(findProvider("nope")).toBeUndefined();
  });
});

describe("validateBaseUrl", () => {
  it("accepts http(s) URLs and rejects everything else", () => {
    expect(validateBaseUrl("https://api.openai.com/v1")).toEqual({ ok: true });
    expect(validateBaseUrl("http://localhost:1234/v1")).toEqual({ ok: true });
    expect(validateBaseUrl("ftp://example.com/v1").ok).toBe(false);
    expect(validateBaseUrl("not a url").ok).toBe(false);
    expect(validateBaseUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateBaseUrl("https://user:pass@example.com/v1").ok).toBe(false);
    expect(validateBaseUrl("").ok).toBe(false);
    expect(validateBaseUrl("http://example.com/v1").ok).toBe(false);
    expect(validateBaseUrl("https://10.0.0.5/v1").ok).toBe(false);
    expect(validateBaseUrl("https://169.254.169.254/latest").ok).toBe(false);
    expect(validateBaseUrl("https://service.internal/v1").ok).toBe(false);
    expect(validateBaseUrl("http://127.0.0.1:1234/v1").ok).toBe(true);
  });
});
