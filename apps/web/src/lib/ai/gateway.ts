import { THINKING, type ThinkingLevel } from "@spektrum/shared/ai";

export type GatewayEvent =
  | { type: "thinking"; delta: string }
  | { type: "text"; delta: string }
  | { type: "tool_call_start"; index: number; id: string; name: string }
  | { type: "tool_call_delta"; index: number; argsDelta: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done" };

export type GatewayMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

export class GatewayHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GatewayHttpError";
  }
}

export class GatewayNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayNetworkError";
  }
}

type ToolCallAccumulator = { id: string; name: string; args: string };

/**
 * Stream one OpenAI-compatible chat completion. Yields normalised events; the
 * caller accumulates `tool_call_delta` into JSON arguments.
 */
export async function* streamGateway(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  thinking: ThinkingLevel;
  messages: GatewayMessage[];
  tools?: unknown[];
  signal?: AbortSignal;
  maxOutput?: number;
}): AsyncGenerator<GatewayEvent> {
  const { baseUrl, apiKey, model, thinking, messages, tools, signal } = input;
  const { effort } = THINKING[thinking];
  const maxTokens = input.maxOutput ?? THINKING[thinking].maxOutput;

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      // A user-configured endpoint must not redirect the Bearer token to an
      // internal service after validateBaseUrl passed.
      redirect: "error",
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        reasoning_effort: effort,
        max_tokens: maxTokens,
        ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
      }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw new GatewayNetworkError(
      error instanceof Error ? error.message : "gateway request failed",
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const safe = body.split(apiKey).join("[redacted]").slice(0, 500);
    throw new GatewayHttpError(
      response.status,
      safe || `gateway responded ${response.status}`,
    );
  }

  if (!response.body) {
    throw new GatewayNetworkError("gateway returned an empty body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map<number, ToolCallAccumulator>();
  let buffer = "";
  let doneSent = false;

  const handleFrame = function* (frame: string): Generator<GatewayEvent> {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        doneSent = true;
        yield { type: "done" };
        return;
      }
      let json: {
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        choices?: Array<{
          delta?: {
            reasoning_content?: string;
            reasoning?: string;
            content?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }

      if (json.usage) {
        yield {
          type: "usage",
          inputTokens: json.usage.prompt_tokens ?? 0,
          outputTokens: json.usage.completion_tokens ?? 0,
        };
      }

      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.reasoning_content) {
        yield { type: "thinking", delta: delta.reasoning_content };
      }
      if (delta.reasoning) {
        yield { type: "thinking", delta: delta.reasoning };
      }
      if (delta.content) {
        yield { type: "text", delta: delta.content };
      }
      for (const call of delta.tool_calls ?? []) {
        const index = call.index ?? 0;
        let entry = toolCalls.get(index);
        if (!entry) {
          entry = {
            id: call.id ?? "",
            name: call.function?.name ?? "",
            args: "",
          };
          toolCalls.set(index, entry);
          yield {
            type: "tool_call_start",
            index,
            id: entry.id,
            name: entry.name,
          };
        }
        if (call.id) entry.id = call.id;
        if (call.function?.name) entry.name = call.function.name;
        const argsDelta = call.function?.arguments ?? "";
        if (argsDelta) {
          entry.args += argsDelta;
          yield { type: "tool_call_delta", index, argsDelta };
        }
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        yield* handleFrame(frame);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield* handleFrame(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!doneSent) yield { type: "done" };
}