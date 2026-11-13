"use client";

import { useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { ThemeSwitcher } from "@spektrum/ui";
import { ToggleRow } from "../toggle-row";
import { SelectRow } from "../select-row";

const FONT_SIZES = [
  { value: "12", label: "Small" },
  { value: "13", label: "Normal" },
  { value: "15", label: "Large" },
] as const;

function fontValue(px: number): string {
  return px <= 12 ? "12" : px >= 15 ? "15" : "13";
}

export function EditorSection() {
  const { preferences, setPreference } = usePreferences();
  const [word, setWord] = useState("");
  const [char, setChar] = useState("");

  const addWord = () => {
    const normalised = word.trim().toLowerCase();
    if (!normalised) return;
    if (!preferences.editorSpellcheckWords.includes(normalised)) {
      setPreference("editorSpellcheckWords", [
        ...preferences.editorSpellcheckWords,
        normalised,
      ]);
    }
    setWord("");
  };

  const addCharacter = () => {
    const value = char.trim();
    if (value.length !== 1) return;
    if (!preferences.editorUnicodeAllowedCharacters.includes(value)) {
      setPreference("editorUnicodeAllowedCharacters", [
        ...preferences.editorUnicodeAllowedCharacters,
        value,
      ]);
    }
    setChar("");
  };

  return (
    <div className="flex flex-col">
      <div className="text-base font-normal text-text-editor-primary">
        Interface Theme
      </div>
      <div className="pb-4 text-sm text-text-editor-secondary">
        Select your interface color scheme.
      </div>
      <div className="pb-4">
        <ThemeSwitcher
          value={preferences.interfaceTheme}
          onChange={(v) => setPreference("interfaceTheme", v)}
          systemLabel="System default"
        />
      </div>

      <SelectRow
        label="Font size"
        description="Adjust the editor font size."
        value={fontValue(preferences.editorFontSize)}
        options={FONT_SIZES}
        onChange={(v) => setPreference("editorFontSize", Number(v))}
      />

      <ToggleRow
        label="Auto Formatting"
        description="Automatically add the correct number of spaces before each code command"
        checked={preferences.autoFormatting}
        onChange={(v) => setPreference("autoFormatting", v)}
      />
      <ToggleRow
        label="Realtime compilation"
        description="Automatically compile the document as you type"
        checked={preferences.realtimeCompilation}
        onChange={(v) => setPreference("realtimeCompilation", v)}
      />
      <ToggleRow
        label="Equation hover"
        description="Show live equation previews when hovering LaTeX math."
        checked={preferences.equationHover}
        onChange={(v) => setPreference("equationHover", v)}
      />
      <ToggleRow
        label="Disable Word Wrap"
        description="Prevents lines from wrapping, requiring horizontal scrolling for long lines."
        checked={preferences.disableWordWrap}
        onChange={(v) => setPreference("disableWordWrap", v)}
      />
      <ToggleRow
        label="Disable Sticky Scroll"
        description="Keeps parent structures (sections, environments) visible while scrolling. Disable to stop headers from sticking to the top."
        checked={preferences.disableStickyScroll}
        onChange={(v) => setPreference("disableStickyScroll", v)}
      />
      <ToggleRow
        label="Editor spellcheck"
        description="Underline possible misspellings for supported dictionary languages. Unsupported locales currently fall back to English."
        checked={preferences.editorSpellcheckEnabled}
        onChange={(v) => setPreference("editorSpellcheckEnabled", v)}
      />

      <div className="flex flex-col gap-2 py-4">
        <div className="text-base font-normal text-text-editor-primary">
          Personal spellcheck dictionary
        </div>
        <div className="text-sm text-text-editor-secondary">
          Add words to your personal spellcheck dictionary. These words are stored in local
          settings and ignored across projects in this browser.
        </div>
        <div className="flex items-center gap-2">
          <input
            aria-label="Add a word to ignore"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addWord();
            }}
            className="h-8 w-64 rounded-lg border border-[color:var(--border-outline)] bg-bg-app px-2 text-sm"
          />
          <button
            type="button"
            onClick={addWord}
            className="h-8 rounded-lg bg-[color:var(--button-primary-bg)] px-3 text-sm text-[color:var(--button-primary-text)]"
          >
            Add
          </button>
        </div>
        {preferences.editorSpellcheckWords.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-text-editor-secondary">
            {preferences.editorSpellcheckWords.map((w) => (
              <li key={w} className="flex items-center gap-2">
                <span>{w}</span>
                <button
                  type="button"
                  aria-label={`Remove ${w}`}
                  onClick={() =>
                    setPreference(
                      "editorSpellcheckWords",
                      preferences.editorSpellcheckWords.filter((x) => x !== w),
                    )
                  }
                  className="text-xs text-text-editor-tertiary hover:text-text-editor-primary"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ToggleRow
        label="Highlight ambiguous Unicode characters"
        description="Warn when a character looks like another character."
        checked={preferences.editorUnicodeHighlightEnabled}
        onChange={(v) => setPreference("editorUnicodeHighlightEnabled", v)}
      />
      <ToggleRow
        label="Highlight invisible Unicode characters"
        description="Warn about invisible characters such as zero-width spaces."
        checked={preferences.editorUnicodeInvisibleHighlightEnabled}
        onChange={(v) => setPreference("editorUnicodeInvisibleHighlightEnabled", v)}
      />

      <div className="flex flex-col gap-2 py-4">
        <div className="text-base font-normal text-text-editor-primary">
          Allowed Unicode characters
        </div>
        <div className="text-sm text-text-editor-secondary">
          Add one character at a time. Allowed characters are saved across projects in this
          browser.
        </div>
        <div className="flex items-center gap-2">
          <input
            aria-label="Enter one character"
            placeholder="Enter one character"
            value={char}
            onChange={(e) => setChar(e.target.value)}
            className="h-8 w-40 rounded-lg border border-[color:var(--border-outline)] bg-bg-app px-2 text-sm"
          />
          <button
            type="button"
            onClick={addCharacter}
            className="h-8 rounded-lg bg-[color:var(--button-primary-bg)] px-3 text-sm text-[color:var(--button-primary-text)]"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}