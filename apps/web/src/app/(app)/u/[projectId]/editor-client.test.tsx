// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
vi.mock("@/editor/monaco-editor", () => ({
  MonacoEditor: () => <div data-testid="monaco-editor" />,
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
        documents={DOCS}
        initialDocument={DOC}
        user={{ name: "Keylhan Paumard", email: "owner@spektrum.local" }}
        aiEnabled
        {...overrides}
      />
    </PreferencesProvider>,
  );
}

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