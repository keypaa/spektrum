// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabStrip } from "./tab-strip";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TABS = [
  { path: "main.tex", kind: "tex" as const },
  { path: "refs.bib", kind: "bib" as const },
];

function renderStrip(overrides: Partial<React.ComponentProps<typeof TabStrip>> = {}) {
  const props: React.ComponentProps<typeof TabStrip> = {
    tabs: TABS,
    active: "main.tex",
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onOpenChat: vi.fn(),
    onRecompile: vi.fn(),
    tools: (
      <button type="button" aria-label="Tools">
        Tools
      </button>
    ),
    ...overrides,
  };
  return { ...render(<TabStrip {...props} />), props };
}

describe("TabStrip", () => {
  it("renders one tab per path in open order", () => {
    renderStrip();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["main.tex", "refs.bib"]);
  });

  it("marks the active tab with aria-selected and a plain dark chip", () => {
    renderStrip();
    const active = screen.getByTestId("tab-main.tex");
    expect(active.getAttribute("aria-selected")).toBe("true");
    expect(active.className).toContain("bg-bg-tertiary");
    expect(active.className).not.toContain("border-t-2");
    expect(active.className).not.toContain("border-brand");
    expect(screen.getByTestId("tab-refs.bib").getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  it("uses a readable icon size in the tab chips", () => {
    renderStrip();
    const icon = screen.getByTestId("tab-main.tex").querySelector("svg");
    expect(icon?.getAttribute("width")).toBe("18");
    expect(icon?.getAttribute("height")).toBe("18");
  });

  it("clicking a tab activates it; the close button closes without activating", async () => {
    const { props } = renderStrip();
    await userEvent.click(screen.getByText("refs.bib"));
    expect(props.onActivate).toHaveBeenCalledWith("refs.bib");

    await userEvent.click(screen.getByRole("button", { name: "Close main.tex" }));
    expect(props.onClose).toHaveBeenCalledWith("main.tex");
    expect(props.onActivate).toHaveBeenCalledTimes(1);
  });

  it("middle-click closes the tab", async () => {
    const { props } = renderStrip();
    screen.getByTestId("tab-main.tex").dispatchEvent(
      new MouseEvent("auxclick", { button: 1, bubbles: true }),
    );
    expect(props.onClose).toHaveBeenCalledWith("main.tex");
  });

  it("the left icon opens chat instead of collapsing the sidebar", async () => {
    const { props } = renderStrip();
    expect(screen.queryByRole("button", { name: "Collapse sidebar" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open chat" }));
    expect(props.onOpenChat).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Recompile" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tools" })).toBeTruthy();
    expect(props.onRecompile).not.toHaveBeenCalled();
  });

  it("the tab list scrolls horizontally and centers the chips vertically", () => {
    renderStrip();
    const list = screen.getByRole("tablist");
    expect(list.className).toContain("overflow-x-auto");
    expect(list.className).toContain("min-w-0");
    expect(list.className).toContain("items-center");
    expect(list.className).not.toContain("items-stretch");
  });
});