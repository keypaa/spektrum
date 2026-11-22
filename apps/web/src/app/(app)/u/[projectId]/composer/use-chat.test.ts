// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendStreamDelta,
  partsFromThreadMessages,
  useChat,
} from "./use-chat";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const SSE =
  'event: meta\ndata: {"threadId":"t1","userMessageId":"m1","model":"m"}\n\n' +
  'event: done\ndata: {"usage":{"in":1,"out":1}}\n\n';

function mockFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () =>
      new Response(SSE, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useChat.send", () => {
  const selection = { path: "a.tex", startLine: 2, endLine: 3 };

  it("sends pinned paths and selection in the POST body", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useChat({ projectId: "p1" }));
    act(() => result.current.send("hello", "Medium", ["a.tex"], undefined, selection));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.pinnedPaths).toEqual(["a.tex"]);
    expect(body.selection).toEqual(selection);
  });

  it("resends the selection on retry", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useChat({ projectId: "p1" }));
    act(() => result.current.send("hello", "Medium", [], undefined, selection));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    act(() => result.current.retry());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const init = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(JSON.parse(init.body as string).selection).toEqual(selection);
  });
});

describe("partsFromThreadMessages", () => {
  it("keeps reloaded user turns on the right", () => {
    const parts = partsFromThreadMessages([
      { role: "user", content: { parts: [{ type: "text", text: "hey" }] } },
      { role: "assistant", content: { parts: [{ type: "text", text: "Hi" }] } },
    ]);
    expect(parts[0]).toEqual({ type: "text", text: "User: hey" });
    expect(parts[1]).toEqual({ type: "text", text: "Hi" });
  });
});

describe("appendStreamDelta", () => {
  it("merges consecutive thinking deltas into one block", () => {
    let parts = appendStreamDelta([], "thinking", "The");
    parts = appendStreamDelta(parts, "thinking", " user is greeting");
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: "thinking", text: "The user is greeting" });
  });

  it("starts a new part only when the stream switches type", () => {
    let parts = appendStreamDelta([], "thinking", "reasoning");
    parts = appendStreamDelta(parts, "text", "Hi");
    parts = appendStreamDelta(parts, "thinking", "more reasoning");
    expect(parts.map((part) => part.type)).toEqual(["thinking", "text", "thinking"]);
  });

  it("starts a fresh block after a tool event", () => {
    const parts = appendStreamDelta(
      [
        {
          type: "tool_result",
          id: "t1",
          ok: true,
          summary: "done",
        },
      ],
      "thinking",
      "after tool",
    );
    expect(parts).toHaveLength(2);
    expect(parts[1]).toEqual({ type: "thinking", text: "after tool" });
  });

  it("does not append assistant text to the user's message", () => {
    let parts = appendStreamDelta([], "text", "User: can you read this?");
    parts = appendStreamDelta(parts, "text", "Yes, I can.");

    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: "text", text: "User: can you read this?" });
    expect(parts[1]).toEqual({ type: "text", text: "Yes, I can." });
  });
});
