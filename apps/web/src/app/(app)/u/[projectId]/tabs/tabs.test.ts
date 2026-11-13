// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  readTabs,
  tabsReducer,
  tabsStorageKey,
  writeTabs,
  type TabsState,
} from "./tabs";

afterEach(() => {
  localStorage.clear();
});

const EMPTY: TabsState = { open: [], active: null };

describe("tabsReducer", () => {
  it("open appends and activates", () => {
    const next = tabsReducer(EMPTY, { type: "open", path: "main.tex" });
    expect(next).toEqual({ open: ["main.tex"], active: "main.tex" });
  });

  it("open of an existing path activates without duplicating", () => {
    const state: TabsState = { open: ["main.tex", "refs.bib"], active: "refs.bib" };
    const next = tabsReducer(state, { type: "open", path: "main.tex" });
    expect(next).toEqual({ open: ["main.tex", "refs.bib"], active: "main.tex" });
  });

  it("close of an inactive tab keeps the active one", () => {
    const state: TabsState = { open: ["main.tex", "refs.bib"], active: "main.tex" };
    const next = tabsReducer(state, { type: "close", path: "refs.bib" });
    expect(next).toEqual({ open: ["main.tex"], active: "main.tex" });
  });

  it("close of the active tab activates the next one", () => {
    const state: TabsState = { open: ["a", "b", "c"], active: "b" };
    expect(tabsReducer(state, { type: "close", path: "b" })).toEqual({
      open: ["a", "c"],
      active: "c",
    });
  });

  it("close of the last tab falls back to the previous, then null", () => {
    expect(
      tabsReducer({ open: ["a", "b"], active: "b" }, { type: "close", path: "b" }),
    ).toEqual({ open: ["a"], active: "a" });
    expect(
      tabsReducer({ open: ["a"], active: "a" }, { type: "close", path: "a" }),
    ).toEqual({ open: [], active: null });
  });

  it("rename updates the path in place and the active path", () => {
    const state: TabsState = { open: ["a", "b.tex", "c"], active: "b.tex" };
    const next = tabsReducer(state, {
      type: "rename",
      from: "b.tex",
      to: "b2.tex",
    });
    expect(next).toEqual({ open: ["a", "b2.tex", "c"], active: "b2.tex" });
  });

  it("sync filters to known paths and clears a missing active", () => {
    const state: TabsState = { open: ["a", "gone", "b"], active: "gone" };
    const next = tabsReducer(state, { type: "sync", paths: ["a", "b", "c"] });
    expect(next).toEqual({ open: ["a", "b"], active: null });
  });

  it("sync keeps the active path when it survives", () => {
    const state: TabsState = { open: ["a", "b"], active: "b" };
    expect(tabsReducer(state, { type: "sync", paths: ["a", "b"] })).toEqual({
      open: ["a", "b"],
      active: "b",
    });
  });
});

describe("storage", () => {
  it("tabsStorageKey is namespaced per project", () => {
    expect(tabsStorageKey("p1")).toBe("spektrum_editor_tabs_v1:p1");
  });

  it("round-trips a state", () => {
    const state: TabsState = { open: ["main.tex", "refs.bib"], active: "refs.bib" };
    writeTabs("p1", state);
    expect(readTabs("p1")).toEqual(state);
  });

  it("returns the empty state for corrupt JSON or a wrong shape", () => {
    localStorage.setItem("spektrum_editor_tabs_v1:p1", "{not json");
    expect(readTabs("p1")).toEqual(EMPTY);
    localStorage.setItem(
      "spektrum_editor_tabs_v1:p1",
      JSON.stringify({ open: "nope", active: 5 }),
    );
    expect(readTabs("p1")).toEqual(EMPTY);
  });

  it("returns the empty state when nothing is stored", () => {
    expect(readTabs("never")).toEqual(EMPTY);
  });
});