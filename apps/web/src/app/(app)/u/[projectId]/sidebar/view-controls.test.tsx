// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEW, ViewControlsMenu, layoutForView } from "./view-controls";

afterEach(cleanup);

describe("ViewControlsMenu", () => {
  it("opens a menu with Code, PDF, Sidebar and Assistant switches", async () => {
    const onChange = vi.fn();
    render(<ViewControlsMenu value={DEFAULT_VIEW} onChange={onChange} />);
    expect(screen.queryByTestId("view-controls-menu")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "View controls" }));
    expect(screen.getByTestId("view-controls-menu")).toBeTruthy();
    for (const label of ["Code", "PDF", "Sidebar", "Assistant"]) {
      expect(screen.getByRole("switch", { name: label })).toBeTruthy();
    }

    await userEvent.click(screen.getByRole("switch", { name: "Sidebar" }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VIEW, sidebar: false });
  });

  it("closes on outside click", async () => {
    render(<ViewControlsMenu value={DEFAULT_VIEW} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "View controls" }));
    expect(screen.getByTestId("view-controls-menu")).toBeTruthy();
    await userEvent.click(document.body);
    expect(screen.queryByTestId("view-controls-menu")).toBeNull();
  });
});

describe("layoutForView", () => {
  it("keeps a slim rail when the sidebar is hidden", () => {
    expect(layoutForView({ ...DEFAULT_VIEW, sidebar: false }).sidebarWidth).toBe(
      "44px",
    );
    expect(layoutForView(DEFAULT_VIEW).sidebarWidth).toBe("442px");
  });

  it("collapses the right pane to zero when PDF is hidden", () => {
    expect(layoutForView({ ...DEFAULT_VIEW, pdf: false }).rightPaneWidth).toBe(
      "0px",
    );
    expect(layoutForView(DEFAULT_VIEW).rightPaneWidth).toBe("677px");
  });
});
