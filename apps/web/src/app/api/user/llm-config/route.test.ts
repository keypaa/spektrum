import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@spektrum/shared/preferences";
import { loadWebEnv } from "@spektrum/shared/env";

vi.mock("@/auth/session", () => ({
  requireUser: async () => ({ id: "u1", role: "member" }),
}));
vi.mock("@spektrum/shared/http/guard", () => ({
  assertSameOrigin: () => undefined,
}));
vi.mock("@/lib/preferences", () => ({
  getPreferences: async () => ({ ...DEFAULT_PREFERENCES }),
}));

import { GET } from "./route";

describe("GET /api/user/llm-config", () => {
  it("returns the effective models and endpoint without any secret", async () => {
    const res = await GET({} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    const env = loadWebEnv();
    expect(body).toEqual({
      configured: false,
      providerId: DEFAULT_PREFERENCES.llm.providerId,
      baseUrl: env.llmBaseUrl,
      chatModel: env.llmModelChat,
      fastModel: env.llmModelFast,
    });
    expect(JSON.stringify(body)).not.toMatch(/key|secret/i);
  });
});
