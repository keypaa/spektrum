// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  onZoomToFit: vi.fn(),
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

  it("ignores an error event from a stale revision", () => {
    expect(
      pillState({
        render: { event: "status", state: "error", revision: "old" },
        isCurrent: false,
        dirty: false,
        currentRevision: "current",
      }),
    ).toBe("compiled");
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

  it("measures the fit instead of snapping to 100%", async () => {
    const onZoomToFit = vi.fn();
    render(<PdfChrome {...base} state="compiled" onZoomToFit={onZoomToFit} />);
    await userEvent.click(screen.getByTestId("pdf-zoom"));
    await userEvent.click(await screen.findByText("Zoom to fit"));
    // The chrome no longer owns the number: the viewer measures it.
    expect(onZoomToFit).toHaveBeenCalledTimes(1);
  });

  it("uses custom page steppers that appear on hover", async () => {
    const onPage = vi.fn();
    render(<PdfChrome {...base} state="compiled" onPage={onPage} page={2} />);
    const next = screen.getByRole("button", { name: "Next page" });
    const previous = screen.getByRole("button", { name: "Previous page" });
    expect(next.parentElement?.className).not.toContain("opacity-0");
    expect(screen.getByLabelText("Page").className).toContain("appearance-none");

    await userEvent.click(next);
    expect(onPage).toHaveBeenLastCalledWith(3);
    await userEvent.click(previous);
    expect(onPage).toHaveBeenLastCalledWith(1);
  });

  it("disables the stepper at the first and last page", () => {
    render(<PdfChrome {...base} state="compiled" page={1} />);
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders the pill without applying a filter to the chrome", () => {
    render(<PdfChrome {...base} state="compiled" darkMode />);
    expect(screen.getByTestId("pdf-pill")).toBeTruthy();
  });

  // The bar auto-hides 2 s after the last pointer *move*. It used to do that
  // even while the pointer was resting on it, so the bar vanished from under the
  // cursor and the click landed on the page beneath.
  it("keeps the floating bar while the pointer is over it", () => {
    vi.useFakeTimers();
    try {
      render(<PdfChrome {...base} state="compiled" />);
      const bar = screen.getByTestId("pdf-floating-bar");
      fireEvent.pointerEnter(bar);

      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(screen.queryByTestId("pdf-floating-bar")).not.toBeNull();

      fireEvent.pointerLeave(bar);
      act(() => {
        vi.advanceTimersByTime(2_100);
      });
      expect(screen.queryByTestId("pdf-floating-bar")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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