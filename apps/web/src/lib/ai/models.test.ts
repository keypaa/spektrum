import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: null as null | {
    key: string;
    source: "user" | "server";
    baseUrl: string;
    chatModel: string;
    fastModel: string;
  },
  urls: [] as string[],
}));

vi.mock("./keys", () => ({
  resolveLlmConfigForRequest: async () => state.config,
}));

import { listModels } from "./models";

beforeEach(() => {
  state.urls = [];
  state.config = {
    key: "k",
    source: "user",
    baseUrl: "https://one.example/v1",
    chatModel: "m1",
    fastModel: "m2",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      state.urls.push(url);
      return new Response(JSON.stringify({ data: [{ id: "remote-model" }] }), {
        status: 200,
      });
    }),
  );
});

describe("listModels", () => {
  it("uses the configured endpoint instead of the env default", async () => {
    const models = await listModels("user-1", "member");
    expect(models).toEqual([
      { id: "remote-model", label: "remote-model", imageSupport: "unknown" },
    ]);
    expect(state.urls).toEqual(["https://one.example/v1/models"]);
  });

  it("does not reuse a cached list when the user changes endpoint", async () => {
    await listModels("user-2", "member");
    state.config = { ...state.config!, baseUrl: "https://two.example/v1" };
    await listModels("user-2", "member");
    expect(state.urls).toEqual([
      "https://one.example/v1/models",
      "https://two.example/v1/models",
    ]);
  });
});
