// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PdfChrome, pillState } from "./pdf-chrome";
import { PdfSearch } from "./pdf-search";

afterEach(cleanup);

const result = {
  event: "result" as const,
  revision: "a".repeat(64),
  pdfUrl: "/pdf",
  diagnostics: [],
  stats: {
    words: 1,
    wordsInText: 1,
    wordsInHeaders: 0,
    wordsOutsideText: 0,
    headers: 0,
    figures: 0,
    mathInline: 0,
    mathDisplay: 0,
  },
  durationMs: 12,
};

const base = {
  page: 1,
  numPages: 3,
  zoom: 100,
  onPage: vi.fn(),
  onZoom: vi.fn(),
  onRefresh: vi.fn(),
  onGoToPdf: vi.fn(),
  onSearch: vi.fn(),
  pdfUrl: null,
  mainFile: null,
  durationMs: null,
  isCurrent: true,
  revision: null,
  darkMode: false,
  zoomShortcuts: true,
};

describe("pillState", () => {
  it("maps every render state", () => {
    expect(pillState({ render: null, isCurrent: false, dirty: false })).toBe(
      "initializing",
    );
    expect(
      pillState({
        render: { event: "status", state: "running", revision: "x" },
        isCurrent: false,
        dirty: false,
      }),
    ).toBe("compiling");
    expect(
      pillState({ render: result, isCurrent: true, dirty: false }),
    ).toBe("compiled");
    expect(
      pillState({
        render: { event: "status", state: "error", revision: "x" },
        isCurrent: false,
        dirty: false,
      }),
    ).toBe("failed");
    expect(pillState({ render: null, isCurrent: false, dirty: true })).toBe(
      "dirty",
    );
  });
});

describe("PdfChrome", () => {
  it("clamps the page input to 1..numPages", () => {
    const onPage = vi.fn();
    render(<PdfChrome {...base} onPage={onPage} state="compiled" page={1} />);
    const input = screen.getByLabelText("Page");
    fireEvent.change(input, { target: { value: "9" } });
    expect(onPage).toHaveBeenLastCalledWith(3);
    fireEvent.change(input, { target: { value: "0" } });
    expect(onPage).toHaveBeenLastCalledWith(1);
  });

  it("lists the zoom values from §8.1", async () => {
    render(<PdfChrome {...base} state="compiled" />);
    await userEvent.click(screen.getByTestId("pdf-zoom"));
    expect(await screen.findByText("Zoom to fit")).toBeTruthy();
    expect(await screen.findByText("50 %")).toBeTruthy();
    expect(await screen.findByText("400 %")).toBeTruthy();
  });

  it("renders the pill without applying a filter to the chrome", () => {
    render(<PdfChrome {...base} state="compiled" darkMode />);
    expect(screen.getByTestId("pdf-pill")).toBeTruthy();
  });
});

describe("PdfSearch", () => {
  it("keeps keystrokes in the field and closes on Escape", async () => {
    const onClose = vi.fn();
    const onQuery = vi.fn();
    render(<PdfSearch query="" onQuery={onQuery} onClose={onClose} />);
    const input = screen.getByLabelText("Search the PDF");
    await userEvent.type(input, "abc");
    expect(onQuery).toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});