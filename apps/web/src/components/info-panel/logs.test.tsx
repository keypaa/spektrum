// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const renderLogs = (overrides: Partial<React.ComponentProps<typeof Logs>> = {}) => {
  const props = {
    diagnostics,
    log: "raw",
    onJump: vi.fn(),
    onFix: vi.fn(),
    aiEnabled: true,
    ...overrides,
  };
  render(<Logs {...props} />);
  return props;
};

describe("Logs", () => {
  it("defaults to warnings and errors and filters to warnings", async () => {
    renderLogs();
    expect(screen.getByText("Undefined control sequence")).toBeTruthy();
    await userEvent.click(screen.getByLabelText("Logs filter"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Warnings only" }));
    expect(screen.queryByText("Undefined control sequence")).toBeNull();
    expect(screen.getByText(/Overfull \\hbox/)).toBeTruthy();
  });

  it("shows the raw tail", async () => {
    renderLogs({ log: "line one" });
    await userEvent.click(screen.getByLabelText("Logs filter"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Raw logs" }));
    expect(screen.getByTestId("logs-raw").textContent).toContain("line one");
  });

  it("jumps to the line when the message button is clicked", () => {
    const onJump = vi.fn();
    renderLogs({ onJump });
    fireEvent.click(screen.getByText("Undefined control sequence"));
    expect(onJump).toHaveBeenCalledWith(diagnostics[0]);
  });

  it("shows the empty state", () => {
    renderLogs({ diagnostics: [] });
    expect(screen.getByText("No errors or warnings")).toBeTruthy();
  });

  it("gives each card two sibling buttons (message + Fix with AI), never nested", () => {
    renderLogs();
    const cards = screen.getAllByTestId("log-card");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.querySelectorAll("button")).toHaveLength(2);
      expect(card.querySelector("button button")).toBeNull();
    }
  });

  it("Fix with AI passes that diagnostic; Fix all passes every visible one", async () => {
    const props = renderLogs();
    await userEvent.click(screen.getAllByRole("button", { name: "Fix with AI" })[1]!);
    expect(props.onFix).toHaveBeenCalledWith([diagnostics[1]]);

    await userEvent.click(screen.getByRole("button", { name: "Fix all with AI" }));
    expect(props.onFix).toHaveBeenLastCalledWith(diagnostics);
  });

  it("replaces the Fix actions with the key prompt when AI is unavailable", () => {
    renderLogs({ aiEnabled: false });
    expect(screen.queryByRole("button", { name: "Fix with AI" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fix all with AI" })).toBeNull();
    expect(screen.getByText("Add your API key in Settings")).toBeTruthy();
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