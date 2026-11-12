// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditorClient } from "./editor-client";
import type { DocumentRecord, DocumentSummary } from "@/lib/documents";

afterEach(cleanup);

const DOCS: DocumentSummary[] = [
  { id: "d1", path: "main.tex", kind: "tex", updatedAt: "2026-11-12T10:00:00.000Z" },
];

const DOC: DocumentRecord = { ...DOCS[0]!, content: "\\documentclass{article}" };

function renderShell(overrides: Partial<React.ComponentProps<typeof EditorClient>> = {}) {
  return render(
    <EditorClient
      project={{ id: "p1", name: "My Project" }}
      documents={DOCS}
      initialDocument={DOC}
      user={{ name: "Keylhan Paumard", email: "owner@spektrum.local" }}
      {...overrides}
    />,
  );
}

describe("EditorClient", () => {
  it("renders the three-column shell with the project, tabs and placeholders", () => {
    renderShell();
    expect(screen.getByTestId("editor-root")).toBeTruthy();
    expect(screen.getByText("My Project")).toBeTruthy();
    expect(screen.getByText("Files")).toBeTruthy();
    expect(screen.getByText("Chats")).toBeTruthy();
    expect(screen.getByTestId("tab-strip-placeholder").textContent).toContain("main.tex");
    expect(screen.getByTestId("sidebar-placeholder").textContent).toContain("main.tex");
    // Right pane's captured pre-compile state.
    expect(screen.getByTestId("pdf-pane")).toBeTruthy();
    expect(screen.getAllByText("Initializing...").length).toBeGreaterThanOrEqual(1);
    // Placeholders Task 12/14/16 replace.
    expect(screen.getByTestId("tab-strip-placeholder")).toBeTruthy();
    expect(screen.getByTestId("editor-area-placeholder")).toBeTruthy();
    expect(screen.getByTestId("composer-slot-placeholder")).toBeTruthy();
  });

  it("renders without crashing and with no tab when there are no documents", () => {
    renderShell({ documents: [], initialDocument: null });
    expect(screen.getByTestId("editor-root")).toBeTruthy();
    expect(screen.queryByText("main.tex")).toBeNull();
    expect(screen.getByTestId("pdf-pane")).toBeTruthy();
  });
});