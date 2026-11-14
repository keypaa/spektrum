import { describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ text: '{"title":"A generated title"}' }));
vi.mock("./gateway", () => ({
  streamGateway: async function* () {
    yield { type: "text", delta: mock.text };
  },
}));

import { generateTitle } from "./title";

const input = {
  firstUserMessage: "Fix the intro",
  firstAssistantReply: "Done",
  baseUrl: "http://gateway.test/v1",
  apiKey: "test-key",
  model: "openai/gpt-4o-mini",
};

describe("generateTitle", () => {
  it("parses the JSON title", async () => {
    expect(await generateTitle(input)).toBe("A generated title");
  });

  it("rejects a control character", async () => {
        mock.text = '{"title":"Bad\\nTitle"}';
    expect(await generateTitle(input)).toBeNull();
  });

  it("rejects a title over 60 characters", async () => {
        mock.text = JSON.stringify({ title: "x".repeat(61) });
    expect(await generateTitle(input)).toBe("x".repeat(60));
  });

  it("rejects invalid JSON", async () => {
        mock.text = "not json";
    expect(await generateTitle(input)).toBeNull();
  });
});