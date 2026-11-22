// @vitest-environment jsdom
import { forwardRef, useImperativeHandle, type ForwardedRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@spektrum/shared/preferences";
import { PreferencesProvider } from "@/components/preferences-provider";

// The client shell refreshes the RSC tree after a mutation; jsdom has no app
// router, so stub the one hook it uses.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// jsdom cannot load Monaco; the dynamic import would otherwise pull the real
// module into the test.
const state = vi.hoisted(() => ({
  selectionHandler: null as null | ((range: unknown) => void),
  revealRange: vi.fn(),
  composerProps: null as Record<string, unknown> | null,
  flush: vi.fn(async () => undefined),
}));

// Monaco is loaded through next/dynamic, so the mock has to sit there.
vi.mock("next/dynamic", () => ({
  default: () =>
    forwardRef((props: Record<string, unknown>, ref: ForwardedRef<unknown>) => {
      // The shell dynamically imports both Monaco and the PDF viewer. The
      // viewer is the one that receives a pdfUrl.
      if ("pdfUrl" in props) return <div data-testid="pdf-viewer" />;
      state.selectionHandler = props.onSelectionChange as (range: unknown) => void;
      useImperativeHandle(ref, () => ({ revealRange: state.revealRange }));
      return <div data-testid="monaco-editor" />;
    }),
}));

vi.mock("./composer/composer", () => ({
  Composer: (props: Record<string, unknown>) => {
    state.composerProps = props;
    return <div data-testid="composer-mock" />;
  },
}));

vi.mock("./use-autosave", () => ({
  useAutosave: () => ({
    schedule: vi.fn(),
    flush: state.flush,
    isDirty: () => false,
  }),
}));

import { EditorClient } from "./editor-client";
import type { DocumentRecord, DocumentSummary } from "@/lib/documents";

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
});

const DOCS: DocumentSummary[] = [
  { id: "d1", path: "main.tex", kind: "tex", updatedAt: "2026-11-12T10:00:00.000Z" },
];

const DOC: DocumentRecord = { ...DOCS[0]!, content: "\\documentclass{article}" };

function renderShell(overrides: Partial<React.ComponentProps<typeof EditorClient>> = {}) {
  return render(
    <PreferencesProvider initial={DEFAULT_PREFERENCES}>
      <EditorClient
        project={{ id: "p1", name: "My Project" }}
        projects={[
          { id: "p1", name: "My Project" },
          { id: "p2", name: "Other Project" },
        ]}
        documents={DOCS}
        initialDocument={DOC}
        user={{ name: "Keylhan Paumard", email: "owner@spektrum.local" }}
        aiEnabled
        {...overrides}
      />
    </PreferencesProvider>,
  );
}

describe("EditorClient selection wiring", () => {
  beforeEach(() => {
    state.selectionHandler = null;
    state.revealRange.mockClear();
    state.flush.mockClear();
    state.composerProps = null;
  });

  it("passes Monaco selections to the composer with the active path", () => {
    renderShell();
    act(() => state.selectionHandler!({ startLine: 55, endLine: 112 }));
    expect(state.composerProps?.selection).toEqual({
      path: "main.tex",
      startLine: 55,
      endLine: 112,
    });
    act(() => state.selectionHandler!(null));
    expect(state.composerProps?.selection).toEqual({
      path: "main.tex",
      startLine: 55,
      endLine: 112,
    });
  });

  it("clears the selection and reveals a range through the composer callbacks", () => {
    renderShell();
    act(() => state.selectionHandler!({ startLine: 55, endLine: 112 }));
    const props = state.composerProps!;
    act(() => (props.onClearSelection as () => void)());
    expect(state.composerProps?.selection).toBeNull();
    const range = { path: "main.tex", startLine: 55, endLine: 112 };
    act(() => (props.onNavigateToSelection as (r: typeof range) => void)(range));
    expect(state.revealRange).toHaveBeenCalledWith(55, 112);
  });

  it("flushes autosave before the composer sends", async () => {
    renderShell();
    await (state.composerProps?.beforeSend as () => Promise<void>)();
    expect(state.flush).toHaveBeenCalledTimes(1);
  });
});

describe("EditorClient", () => {
  it("renders the three-column shell with the sidebar, tabs and placeholders", async () => {
    renderShell();
    expect(screen.getByTestId("editor-root")).toBeTruthy();
    expect(screen.getByTestId("project-sidebar")).toBeTruthy();
    expect(screen.getByText("My Project")).toBeTruthy();
    expect(screen.getByText("Files")).toBeTruthy();
    expect(screen.getByText("Chats")).toBeTruthy();
    expect(screen.getByTestId("tab-main.tex").textContent).toContain("main.tex");
    expect(screen.queryByTestId("editor-icon-strip")).toBeNull();
    // Right pane's captured pre-compile state.
    expect(screen.getByTestId("pdf-pane")).toBeTruthy();
    expect(screen.getAllByText("Initializing...").length).toBeGreaterThanOrEqual(1);
    // The dynamic Monaco import resolves asynchronously in tests.
    expect(await screen.findByTestId("monaco-editor")).toBeTruthy();
    expect(screen.getByTestId("composer-slot-placeholder")).toBeTruthy();
  });

  it("opens an uploaded PDF in the viewer instead of an empty code editor", async () => {
    const pdf: DocumentSummary = {
      id: "d2",
      path: "paper.pdf",
      kind: "img",
      updatedAt: "2026-11-12T10:00:00.000Z",
    };
    renderShell({ documents: [...DOCS, pdf] });
    expect(await screen.findByTestId("monaco-editor")).toBeTruthy();

    await userEvent.click(screen.getByText("paper.pdf"));

    expect(await screen.findByTestId("pdf-viewer")).toBeTruthy();
    expect(screen.queryByTestId("monaco-editor")).toBeNull();
  });

  it("resizes the chat panel by dragging its top handle", () => {
    renderShell();
    const slot = screen.getByTestId("composer-slot-placeholder");
    expect(slot.style.height).toBe("260px");

    const handle = screen.getByRole("separator", { name: "Resize chat" });
    expect(handle.className).toContain("w-10");
    expect(handle.className).toContain("rounded-full");
    fireEvent.pointerDown(handle, { clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(window, { clientY: 140, pointerId: 1 });

    expect(slot.style.height).toBe("320px");
  });

  it("shows the Prism-style chat header controls", () => {
    renderShell();
    const newChat = screen.getByRole("button", { name: "New chat" });
    expect(newChat.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 16 16");
    expect(screen.getByRole("button", { name: "Close chat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pop out chat" })).toBeTruthy();
    expect(screen.getByTestId("chat-panel").className).toContain("bg-bg-sidepanel/85");
    expect(screen.getByTestId("chat-panel").className).toContain("backdrop-blur-xl");
    expect(screen.getByTestId("chat-panel").className).toContain("backdrop-brightness-50");
    expect(
      screen.getByRole("button", { name: "New chat" }).parentElement?.className,
    ).toContain("mt-1");
    const slot = screen.getByTestId("composer-slot-placeholder");
    expect(slot.className).toContain("absolute");
    expect(slot.parentElement?.className).toContain("relative");
    const handle = screen.getByRole("separator", { name: "Resize chat" });
    expect(handle.className).toContain("absolute");
    expect(handle.className).toContain("top-1");
  });

  it("closes the chat and reopens it from the tab strip", async () => {
    renderShell();
    expect(screen.getByTestId("chat-panel")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Close chat" }));
    expect(screen.queryByTestId("chat-panel")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Open chat" }));
    expect(screen.getByTestId("chat-panel")).toBeTruthy();
  });

  it("pops the chat out into the right column and docks it back", async () => {
    renderShell();
    expect(screen.getByTestId("chat-panel")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Pop out chat" }));

    expect(screen.queryByTestId("chat-panel")).toBeNull();
    expect(screen.getByTestId("chat-panel-popped")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Dock chat" }).querySelector("svg")?.classList.contains("rotate-180"),
    ).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Dock chat" }));

    expect(screen.getByTestId("chat-panel")).toBeTruthy();
    expect(screen.queryByTestId("chat-panel-popped")).toBeNull();
  });

  it("forces a fresh compile from the PDF refresh button", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderShell({
      mainFilePath: "main.tex",
      initialRender: {
        isCurrent: true,
        status: "ok",
        revision: "a".repeat(64),
        pdfUrl: "/render.pdf",
        lastOkRevision: "a".repeat(64),
        mainFile: "main.tex",
        durationMs: 10,
        diagnostics: [],
        stats: null,
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/compile"),
    );
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call![1]?.body))).toEqual({
      mainFile: "main.tex",
      force: true,
    });
  });

  it("keeps the PDF sheet square under a compile error banner", () => {
    renderShell({
      initialRender: {
        isCurrent: false,
        status: "error",
        revision: "a".repeat(64),
        pdfUrl: "/render.pdf",
        lastOkRevision: null,
        mainFile: "main.tex",
        durationMs: 0,
        diagnostics: [{ severity: "error", message: "boom", raw: "boom" }],
        stats: null,
      },
    });
    expect(screen.getByTestId("compile-error")).toBeTruthy();
    expect(screen.getByTestId("pdf-preview-sheet").className).toContain("rounded-t-none");
  });

  it("renders without crashing and with no tab when there are no documents", () => {
    renderShell({ documents: [], initialDocument: null });
    expect(screen.getByTestId("editor-root")).toBeTruthy();
    expect(screen.queryByTestId("tab-main.tex")).toBeNull();
    expect(screen.getByTestId("pdf-pane")).toBeTruthy();
  });
});