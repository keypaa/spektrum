// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessagePart } from "@spektrum/shared/ai";
import { TOO_LARGE_MESSAGE } from "./diff-accept";
import { DiffWidget } from "./diff-widget";

const created = vi.hoisted(() => ({
  models: [] as Array<{ value: string; uri: { toString(): string }; dispose: ReturnType<typeof vi.fn> }>,
  diffEditors: [] as Array<{ setModel: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock("@/editor/monaco-environment", () => ({
  monaco: {
    Uri: { parse: (value: string) => ({ toString: () => value }) },
    editor: {
      createModel: vi.fn((value: string, _language: string, uri: { toString(): string }) => {
        const model = { value, uri, dispose: vi.fn() };
        created.models.push(model);
        return model;
      }),
      createDiffEditor: vi.fn(() => {
        const diff = { setModel: vi.fn(), dispose: vi.fn() };
        created.diffEditors.push(diff);
        return diff;
      }),
    },
  },
  setupMonacoEnvironment: vi.fn(),
}));

afterEach(() => {
  cleanup();
  created.models = [];
  created.diffEditors = [];
  vi.unstubAllGlobals();
});

const PART: Extract<MessagePart, { type: "diff" }> = {
  type: "diff",
  id: "d1",
  messageId: "m1",
  proposal: {
    path: "main.tex",
    kind: "replace",
    hunks: [],
    originalHash: "h",
    proposedContent: "a\nB\nc\n",
    reason: "fix",
  },
  status: "pending",
};

function renderWidget(overrides: Partial<React.ComponentProps<typeof DiffWidget>> = {}) {
  const props = {
    part: PART,
    original: "a\nb\nc\n",
    projectId: "p1",
    threadId: "t1",
    stale: false,
    busy: false,
    onAccept: vi.fn(async () => ({ ok: true as const })),
    onReject: vi.fn(async () => {}),
    onRerun: vi.fn(),
    onStatus: vi.fn(),
    onAcceptAll: vi.fn(),
    ...overrides,
  };
  render(<DiffWidget {...props} />);
  return props;
}

const patchFetch = () =>
  vi.fn(async () => new Response("{}", { status: 200 }));

describe("DiffWidget", () => {
  it("creates the original and modified models and a read-only diff editor", async () => {
    renderWidget();
    // Monaco is imported on demand (a static import broke SSR), so the models
    // appear a tick after mount.
    await waitFor(() => expect(created.models).toHaveLength(2));
    expect(created.models.map((m) => m.value)).toEqual(["a\nb\nc\n", "a\nB\nc\n"]);
    expect(created.models.map((m) => m.uri.toString())).toEqual([
      "inmemory://spektrum-diff/original/d1",
      "inmemory://spektrum-diff/modified/d1",
    ]);
    const diff = created.diffEditors[0]!;
    expect(diff.setModel).toHaveBeenCalledWith({
      original: created.models[0],
      modified: created.models[1],
    });
  });

  it("renders Accept, Reject and Accept all", () => {
    renderWidget();
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" }).className).not.toContain("border");
    expect(screen.getByRole("button", { name: "Accept all" })).toBeTruthy();
  });

  it("accept applies the change, then PATCHes the decision and updates the status", async () => {
    vi.stubGlobal("fetch", patchFetch());
    const props = renderWidget();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(props.onAccept).toHaveBeenCalledWith(PART));
    await waitFor(() => expect(props.onStatus).toHaveBeenCalledWith(PART, "accepted"));
    const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(String(call[0])).toContain("/threads/t1/messages/m1");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      diffId: "d1",
      decision: "accepted",
    });
  });

  it("reject asks for no document change, then PATCHes rejected", async () => {
    vi.stubGlobal("fetch", patchFetch());
    const props = renderWidget();
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(props.onReject).toHaveBeenCalledWith(PART));
    await waitFor(() => expect(props.onStatus).toHaveBeenCalledWith(PART, "rejected"));
  });

  it("Accept all delegates to onAcceptAll", async () => {
    const props = renderWidget();
    await userEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(props.onAcceptAll).toHaveBeenCalled();
  });

  it("shows the stale copy and replaces Accept with Re-run", () => {
    renderWidget({ stale: true });
    expect(
      screen.getByText("The document changed since this suggestion — re-run?"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.getByRole("button", { name: "Re-run" })).toBeTruthy();
  });

  it("surfaces a too-large rejection without PATCHing", async () => {
    const fetchMock = patchFetch();
    vi.stubGlobal("fetch", fetchMock);
    const props = renderWidget({
      onAccept: vi.fn(async () => ({ ok: false as const, error: TOO_LARGE_MESSAGE })),
    });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(screen.getByText(TOO_LARGE_MESSAGE)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(props.onStatus).not.toHaveBeenCalled();
  });
});