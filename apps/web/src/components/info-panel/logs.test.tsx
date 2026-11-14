// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InfoPanel } from "./info-panel";
import { Logs } from "./logs";

afterEach(cleanup);

const diagnostics = [
  {
    severity: "error" as const,
    message: "Undefined control sequence",
    file: "main.tex",
    line: 2,
    raw: "",
  },
  {
    severity: "warning" as const,
    message: "Overfull \\hbox (9.89099pt too wide) detected at line 75",
    file: "main.tex",
    line: 4,
    raw: "",
  },
];

describe("Logs", () => {
  it("defaults to warnings and errors and filters to warnings", () => {
    render(<Logs diagnostics={diagnostics} log="raw" onJump={vi.fn()} />);
    expect(screen.getByText("Undefined control sequence")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Logs filter"), {
      target: { value: "warnings" },
    });
    expect(screen.queryByText("Undefined control sequence")).toBeNull();
    expect(
      screen.getByText(/Overfull \\hbox/),
    ).toBeTruthy();
  });

  it("shows the raw tail", () => {
    render(<Logs diagnostics={diagnostics} log="line one" onJump={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Logs filter"), {
      target: { value: "raw" },
    });
    expect(screen.getByTestId("logs-raw").textContent).toContain("line one");
  });

  it("jumps to the line when a card is clicked", () => {
    const onJump = vi.fn();
    render(<Logs diagnostics={diagnostics} log={null} onJump={onJump} />);
    fireEvent.click(screen.getByText("Undefined control sequence"));
    expect(onJump).toHaveBeenCalledWith(diagnostics[0]);
  });

  it("shows the empty state", () => {
    render(<Logs diagnostics={[]} log={null} onJump={vi.fn()} />);
    expect(screen.getByText("No errors or warnings")).toBeTruthy();
  });
});

describe("InfoPanel", () => {
  it("switches tabs and closes", () => {
    const onTab = vi.fn();
    const onClose = vi.fn();
    render(
      <InfoPanel tab="Logs" onTab={onTab} onClose={onClose}>
        <div />
      </InfoPanel>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Project Info" }));
    expect(onTab).toHaveBeenCalledWith("Project Info");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});