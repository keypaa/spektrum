// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useResizablePane } from "./resizable";

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("useResizablePane", () => {
  it("restores a right-hand pane's width without converting it as a pointer position", () => {
    // Regression: the drag path converts a pointer x into a width, and applying
    // the restored width through that same path turned 677px into 1117px
    // (viewport 1810 - 677 - 16).
    const root = document.createElement("div");
    document.body.appendChild(root);
    const rootRef = { current: root };

    renderHook(() =>
      useResizablePane({
        storageKey: "spektrum_editor_preview_pane_v1",
        cssVar: "--right-pane-width",
        initial: 677,
        min: 360,
        max: 1400,
        rootRef,
        fromRight: true,
        edgeOffset: 16,
      }),
    );

    expect(root.style.getPropertyValue("--right-pane-width")).toBe("677px");
  });

  it("restores a persisted width from localStorage", () => {
    localStorage.setItem("k", JSON.stringify(900));
    const root = document.createElement("div");
    document.body.appendChild(root);

    renderHook(() =>
      useResizablePane({
        storageKey: "k",
        cssVar: "--w",
        initial: 677,
        min: 360,
        max: 1400,
        rootRef: { current: root },
        fromRight: true,
      }),
    );

    expect(root.style.getPropertyValue("--w")).toBe("900px");
  });
});