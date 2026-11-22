// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatImageAttachment } from "@spektrum/shared/ai";
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

const IMAGE: ChatImageAttachment = {
  id: "client-1",
  mimeType: "image/png",
  data: "AQIDBA==",
};

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:local-image"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
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

  it("records pinned files as @mentions in the displayed user message", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useChat({ projectId: "p1" }));
    act(() => result.current.send("hello", "Medium", ["a.tex"]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current.parts[0]).toEqual({
      type: "text",
      text: "User: hello @a.tex",
    });
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

  it("sends images in the POST body and appends optimistic image parts", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useChat({ projectId: "p1" }));

    act(() =>
      result.current.send("look", "Medium", [], undefined, undefined, [IMAGE]),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string).images).toEqual([IMAGE]);
    expect(result.current.parts[0]).toEqual({ type: "text", text: "User: look" });
    expect(result.current.parts[1]).toMatchObject({
      type: "image",
      blobKey: "blob:local-image",
      name: "Image 1",
      mimeType: "image/png",
    });
    expect((result.current.parts[1] as { id: string }).id).toMatch(/^local-/);
  });

  it("keeps a text-only POST body byte-for-byte when no images are passed", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useChat({ projectId: "p1" }));

    act(() => result.current.send("hello", "Medium", []));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).not.toHaveProperty("images");
    expect(result.current.parts).toHaveLength(1);
  });

  it("resends images on retry", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useChat({ projectId: "p1" }));
    act(() =>
      result.current.send("look", "Medium", [], undefined, undefined, [IMAGE]),
    );
    await waitFor(() => expect(result.current.status).toBe("idle"));

    act(() => result.current.retry());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const init = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(JSON.parse(init.body as string).images).toEqual([IMAGE]);
  });

  it("retry without images reuses the same turn and omits images", async () => {
    const errorFrame =
      'event: error\ndata: {"message":"image input not supported. Retry without images.","retryable":false}\n\n';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(errorFrame, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(SSE, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat({ projectId: "p1" }));

    act(() =>
      result.current.send("look", "Medium", [], undefined, undefined, [IMAGE]),
    );
    await waitFor(() =>
      expect(result.current.error).toContain("Retry without images"),
    );
    // The optimistic user text + image are already in the transcript.
    expect(result.current.parts).toHaveLength(2);

    act(() => result.current.retry());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const body = JSON.parse(
      (fetchMock.mock.calls[1]![1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body.message).toBe("look");
    expect(body.retryWithoutImages).toBe(true);
    expect(body).not.toHaveProperty("images");
    // No second user turn and no re-added optimistic parts.
    expect(result.current.parts).toHaveLength(2);
  });

  it("revokes object URLs on reset", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useChat({ projectId: "p1" }));
    act(() =>
      result.current.send("look", "Medium", [], undefined, undefined, [IMAGE]),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => result.current.reset());

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-image");
  });

  it("revokes object URLs when loading a thread", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useChat({ projectId: "p1" }));
    act(() =>
      result.current.send("look", "Medium", [], undefined, undefined, [IMAGE]),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const loadFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ thread: { id: "t1" }, messages: [] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", loadFetch);

    await act(async () => {
      await result.current.loadThread("t1");
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-image");
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
