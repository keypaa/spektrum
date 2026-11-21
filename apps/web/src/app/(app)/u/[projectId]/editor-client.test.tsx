// @vitest-environment jsdom
import { forwardRef, useImperativeHandle, type ForwardedRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
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
    // Right pane's captured pre-compile state.
    expect(screen.getByTestId("pdf-pane")).toBeTruthy();
    expect(screen.getAllByText("Initializing...").length).toBeGreaterThanOrEqual(1);
    // The dynamic Monaco import resolves asynchronously in tests.
    expect(await screen.findByTestId("monaco-editor")).toBeTruthy();
    expect(screen.getByTestId("composer-slot-placeholder")).toBeTruthy();
  });

  it("renders without crashing and with no tab when there are no documents", () => {
    renderShell({ documents: [], initialDocument: null });
    expect(screen.getByTestId("editor-root")).toBeTruthy();
    expect(screen.queryByTestId("tab-main.tex")).toBeNull();
    expect(screen.getByTestId("pdf-pane")).toBeTruthy();
  });
});