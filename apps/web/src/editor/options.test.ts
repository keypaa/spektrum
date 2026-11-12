import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "@spektrum/shared/preferences";
import { createEditorOptions, EDITOR_FONT_FAMILY } from "./options";

describe("createEditorOptions", () => {
  it("matches §7.1 for the defaults", () => {
    const options = createEditorOptions(DEFAULT_PREFERENCES, true);
    expect(options).toMatchObject({
      automaticLayout: true,
      fixedOverflowWidgets: true,
      wordWrap: "on",
      fontSize: 13,
      minimap: { side: "left", enabled: false },
      suggest: { showWords: false, showStatusBar: true, preview: true },
      stickyScroll: { enabled: true },
    });
  });

  it("uses the verbatim roboto_mono stack", () => {
    expect(EDITOR_FONT_FAMILY).toBe(
      "'roboto_mono', ui-monospace, SFMono-Regular, Roboto Mono, Consolas, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace",
    );
    expect(createEditorOptions(DEFAULT_PREFERENCES, false).fontFamily).toBe(
      EDITOR_FONT_FAMILY,
    );
  });

  it("maps disableWordWrap to off", () => {
    const options = createEditorOptions(
      { ...DEFAULT_PREFERENCES, disableWordWrap: true },
      false,
    );
    expect(options.wordWrap).toBe("off");
  });

  it("maps disableStickyScroll to false", () => {
    const options = createEditorOptions(
      { ...DEFAULT_PREFERENCES, disableStickyScroll: true },
      false,
    );
    expect(options.stickyScroll).toEqual({ enabled: false });
  });

  it("passes the font size through", () => {
    expect(createEditorOptions({ ...DEFAULT_PREFERENCES, editorFontSize: 11 }, false).fontSize).toBe(11);
    expect(createEditorOptions({ ...DEFAULT_PREFERENCES, editorFontSize: 20 }, false).fontSize).toBe(20);
  });

  it("returns a fresh object every call (Monaco mutates its input)", () => {
    const a = createEditorOptions(DEFAULT_PREFERENCES, true);
    const b = createEditorOptions(DEFAULT_PREFERENCES, true);
    expect(a).not.toBe(b);
    expect(a.minimap).not.toBe(b.minimap);
  });
});