// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PdfPane } from "./pdf-pane";

afterEach(cleanup);

describe("PdfPane pre-compile chrome", () => {
  it("uses readable preview ink for the initializing pill", () => {
    render(<PdfPane />);
    const pill = screen.getByRole("button", { name: "Initializing..." });
    expect(pill.className).toContain("text-[color:var(--text-preview-primary)]");
    expect(pill.className).not.toContain("text-tools-fg");
  });

  it("keeps tool-colored text on the dark floating toolbar", () => {
    render(<PdfPane />);
    const goToPdf = screen.getByRole("button", { name: "Go to PDF" });
    expect(goToPdf.className).toContain("text-tools-fg");
  });
});
