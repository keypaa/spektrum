// Monaco editor options (spec §7.1, verbatim from the bundle).
//
// The fontFamily stack is Prism's: roboto_mono (the bundled woff2,
// @font-face in tokens.css) then the usual monospace fallbacks. A fresh
// object is returned every call because Monaco mutates the options it is
// given.

import type { editor } from "monaco-editor";
import type { Preferences } from "@spektrum/shared/preferences";

export const EDITOR_FONT_FAMILY =
  "'roboto_mono', ui-monospace, SFMono-Regular, Roboto Mono, Consolas, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace";

export function createEditorOptions(
  prefs: Preferences,
  isDark: boolean,
): editor.IStandaloneEditorConstructionOptions {
  return {
    value: "",
    language: "latex",
    theme: isDark ? "crixet" : "crixet-light",
    automaticLayout: true,
    fixedOverflowWidgets: true,
    wordWrap: prefs.disableWordWrap ? "off" : "on",
    fontFamily: EDITOR_FONT_FAMILY,
    fontSize: prefs.editorFontSize,
    minimap: { side: "left", enabled: false },
    suggest: { showWords: false, showStatusBar: true, preview: true },
    stickyScroll: { enabled: !prefs.disableStickyScroll },
  };
}