import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayHttpError, streamGateway } from "./gateway";

const frame = (s: string) => `data: ${s}\n\n`;

const SSE = [
  frame(JSON.stringify({ choices: [{ delta: { reasoning_content: "think " } }] })),
  frame(JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })),
  frame(JSON.stringify({ choices: [{ delta: { content: "lo" } }] })),
  frame(
    JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                function: { name: "edit_file", arguments: '{"path":' },
              },
            ],
          },
        },
      ],
    }),
  ),
  frame(
    JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, function: { arguments: '"main.tex"}' } },
            ],
          },
        },
      ],
    }),
  ),
  frame(JSON.stringify({ usage: { prompt_tokens: 11, completion_tokens: 7 } })),
  "data: [DONE]\n\n",
];

function mockFetch(body = SSE, status = 200) {
  const fetchMock = vi.fn(async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of body) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(stream, { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function collect(thinking: Parameters<typeof streamGateway>[0]["thinking"]) {
  const events = [];
  for await (const event of streamGateway({
    baseUrl: "http://gateway.test/v1",
    apiKey: "test-key",
    model: "openai/gpt-4o",
    thinking,
    messages: [{ role: "user", content: "hi" }],
  })) {
    events.push(event);
  }
  return events;
}

afterEach(() => vi.unstubAllGlobals());

describe("streamGateway", () => {
  it("parses thinking, text, tool calls and usage", async () => {
    const fetchMock = mockFetch();
    const events = await collect("Medium");

    expect(events).toEqual([
      { type: "thinking", delta: "think " },
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
      { type: "tool_call_start", index: 0, id: "call_1", name: "edit_file" },
      { type: "tool_call_delta", index: 0, argsDelta: '{"path":' },
      { type: "tool_call_delta", index: 0, argsDelta: '"main.tex"}' },
      { type: "usage", inputTokens: 11, outputTokens: 7 },
      { type: "done" },
    ]);

    const args = events
      .filter((e) => e.type === "tool_call_delta")
      .map((e) => e.argsDelta)
      .join("");
    expect(JSON.parse(args)).toEqual({ path: "main.tex" });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(true);
    expect(body.reasoning_effort).toBe("medium");
    expect(body.max_tokens).toBe(16000);
    expect(headers.get("authorization")).toBe("Bearer test-key");
  });

  it("maps every thinking level to effort and max_tokens", async () => {
    const levels = [
      ["Minimal", "minimal", 4000],
      ["Low", "low", 8000],
      ["Medium", "medium", 16000],
      ["High", "high", 32000],
      ["Extra high", "high", 64000],
    ] as const;
    for (const [thinking, effort, max] of levels) {
      const fetchMock = mockFetch();
      await collect(thinking);
      const body = JSON.parse(
        String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
      );
      expect(body.reasoning_effort).toBe(effort);
      expect(body.max_tokens).toBe(max);
    }
  });

  it("throws GatewayHttpError on a non-2xx response without leaking the key", async () => {
    mockFetch(['data: {"error":"bad key"}\n\n'], 401);
    await expect(collect("Medium")).rejects.toMatchObject({
      name: "GatewayHttpError",
      status: 401,
    });
    await expect(collect("Medium")).rejects.toThrow(GatewayHttpError);
  });

  it("wraps a fetch rejection in GatewayNetworkError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hangup");
      }),
    );
    await expect(collect("Medium")).rejects.toThrow(/socket hangup/);
  });
});