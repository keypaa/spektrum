// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickFileSearch } from "./quick-file-search";
import type { DocumentSummary } from "@/lib/documents";

afterEach(cleanup);

const DOCS: DocumentSummary[] = [
  { id: "d1", path: "main.tex", kind: "tex", updatedAt: "2026-11-12T10:00:00.000Z" },
  { id: "d2", path: "refs.bib", kind: "bib", updatedAt: "2026-11-12T10:00:00.000Z" },
];

describe("QuickFileSearch", () => {
  it("filters by case-insensitive substring and selects on Enter", async () => {
    const onSelect = vi.fn();
    render(
      <QuickFileSearch
        documents={DOCS}
        open
        onOpenChange={() => {}}
        onSelect={onSelect}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Search files" });
    await userEvent.type(input, "MAIN");
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("main.tex");
  });

  it("shows the no-match message", async () => {
    render(
      <QuickFileSearch documents={DOCS} open onOpenChange={() => {}} onSelect={vi.fn()} />,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Search files" }), "zzz");
    expect(screen.getByText("No files match your search.")).toBeTruthy();
  });
});