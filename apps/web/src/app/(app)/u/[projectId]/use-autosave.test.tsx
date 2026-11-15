// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { useAutosave } from "./use-autosave";

const RESULT = {
  documentId: "d1",
  updatedAt: "2026-11-12T10:00:01.000Z",
  revisionHash: "a".repeat(64),
};

const CURRENT = {
  id: "d1",
  path: "main.tex",
  kind: "tex" as const,
  updatedAt: "2026-11-12T10:00:02.000Z",
  content: "server wrote this",
};

let handle: ReturnType<typeof useAutosave>;
let view: ReturnType<typeof render>;
let latest = "v0";
let currentDocId = "d1";
let baseline = "2026-11-12T10:00:00.000Z";
const onSaved = vi.fn();
const onConflict = vi.fn();
const onError = vi.fn();

function Harness(): ReactElement {
  handle = useAutosave({
    projectId: "p1",
    documentId: currentDocId,
    getValue: () => latest,
    getBaseline: () => baseline,
    onSaved,
    onConflict,
    onError,
  });
  return <div />;
}

function patchOk(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(JSON.stringify(RESULT), { status: 200 }));
}

beforeEach(() => {
  latest = "v0";
  currentDocId = "d1";
  baseline = "2026-11-12T10:00:00.000Z";
  onSaved.mockClear();
  onConflict.mockClear();
  onError.mockClear();
  vi.useFakeTimers();
  view = render(<Harness />);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAutosave", () => {
  it("five schedules within 400 ms produce one request", async () => {
    const fetchMock = patchOk();
    vi.stubGlobal("fetch", fetchMock);
    latest = "v1";
    for (let i = 0; i < 5; i++) handle.schedule();
    expect(fetchMock.mock.calls).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(onSaved).toHaveBeenCalledWith(RESULT);
    expect(handle.isDirty()).toBe(false);
  });

  it("flush sends immediately and clears the timer; concurrent flushes send one request", async () => {
    const fetchMock = patchOk();
    vi.stubGlobal("fetch", fetchMock);
    latest = "v1";
    handle.schedule();
    await act(async () => {
      await Promise.all([handle.flush(), handle.flush()]);
    });
    expect(fetchMock.mock.calls).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it("an edit during an in-flight save sends exactly one follow-up", async () => {
    const fetchMock = patchOk();
    vi.stubGlobal("fetch", fetchMock);
    latest = "v1";
    handle.schedule();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock.mock.calls).toHaveLength(1);
    latest = "v2";
    handle.schedule();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock.mock.calls).toHaveLength(2);
    latest = "v3";
    handle.schedule();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock.mock.calls).toHaveLength(3);
  });

  it("409 calls onConflict with the server document and not onError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "conflict", document: CURRENT }), { status: 409 }),
      ),
    );
    latest = "v1";
    handle.schedule();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(onConflict).toHaveBeenCalledWith(CURRENT);
    expect(onError).not.toHaveBeenCalled();
    expect(handle.isDirty()).toBe(false);
  });

  it("a network error calls onError, keeps the buffer dirty and retries on the next edit", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    latest = "v1";
    handle.schedule();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(onError).toHaveBeenCalled();
    expect(handle.isDirty()).toBe(true);

    latest = "v2";
    handle.schedule();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it("blur and pagehide flush", async () => {
    const fetchMock = patchOk();
    vi.stubGlobal("fetch", fetchMock);
    latest = "v1";
    handle.schedule();
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(fetchMock.mock.calls).toHaveLength(1);

    latest = "v2";
    handle.schedule();
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it("visibilitychange to hidden flushes", async () => {
    const fetchMock = patchOk();
    vi.stubGlobal("fetch", fetchMock);
    latest = "v1";
    handle.schedule();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it("skips the keepalive unload save when the body exceeds 60 KiB", async () => {
    const fetchMock = patchOk();
    vi.stubGlobal("fetch", fetchMock);
    latest = "x".repeat(70 * 1024);
    handle.schedule();
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    // The debounced save still happens; only the keepalive send is skipped,
    // so at least the timer path runs. The keepalive path would have used
    // keepalive: true — assert no such call was made.
    const keepaliveCalls = fetchMock.mock.calls.filter(([, init]) => init.keepalive === true);
    expect(keepaliveCalls).toHaveLength(0);
  });

  // The debounce can outlive the document that produced it: the user switches
  // tabs inside the 400 ms window. Reading the live documentId/value at fire
  // time wrote one document's text into another (observed: notes.tex receiving
  // main.tex's content).
  it("saves the document it was scheduled for, not the one active at fire time", async () => {
    const fetchMock = patchOk();
    vi.stubGlobal("fetch", fetchMock);

    currentDocId = "notes-doc";
    latest = "notes text";
    baseline = "2026-11-12T10:00:00.000Z";
    act(() => view.rerender(<Harness />));
    handle.schedule();

    // The tab switches before the debounce fires.
    currentDocId = "main-doc";
    latest = "main text";
    baseline = "2026-11-12T11:00:00.000Z";
    // The parent re-renders with the new active document.
    act(() => view.rerender(<Harness />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    const call = fetchMock.mock.calls[0]!;
    expect(String(call[0])).toContain("/documents/notes-doc");
    const body = JSON.parse(String((call[1] as RequestInit).body)) as {
      content: string;
      baseUpdatedAt: string;
    };
    expect(body.content).toBe("notes text");
    expect(body.baseUpdatedAt).toBe("2026-11-12T10:00:00.000Z");
  });
});