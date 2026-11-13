"use client";

import { useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { ToggleRow } from "../toggle-row";

export function FileManagementSection() {
  const { preferences, setPreference } = usePreferences();
  const [glob, setGlob] = useState("");

  const add = () => {
    const value = glob.trim();
    if (!value) return;
    if (!preferences.hiddenFiles.includes(value)) {
      setPreference("hiddenFiles", [...preferences.hiddenFiles, value]);
    }
    setGlob("");
  };

  return (
    <div className="flex flex-col">
      <ToggleRow
        label="Reveal sidebar on hover"
        description="Open the hidden sidebar when the pointer reaches the left edge."
        checked={preferences.revealSidebarOnHover}
        onChange={(v) => setPreference("revealSidebarOnHover", v)}
      />

      <div className="flex flex-col gap-2 py-4">
        <div className="text-base font-normal text-text-editor-primary">
          Hide files from file tree
        </div>
        <div className="text-sm text-text-editor-secondary">
          Define which types of files should be hidden from the file tree
        </div>
        <div className="flex items-center gap-2">
          <input
            aria-label="Hide files from file tree"
            value={glob}
            onChange={(e) => setGlob(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            className="h-8 w-64 rounded-lg border border-[color:var(--border-outline)] bg-bg-app px-2 text-sm"
          />
          <button
            type="button"
            onClick={add}
            className="h-8 rounded-lg bg-[color:var(--button-primary-bg)] px-3 text-sm text-[color:var(--button-primary-text)]"
          >
            Add
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {preferences.hiddenFiles.map((pattern) => (
            <li
              key={pattern}
              className="flex items-center justify-between gap-2 text-sm text-text-editor-secondary"
            >
              <span>{pattern}</span>
              <button
                type="button"
                aria-label={`Remove ${pattern}`}
                onClick={() =>
                  setPreference(
                    "hiddenFiles",
                    preferences.hiddenFiles.filter((p) => p !== pattern),
                  )
                }
                className="text-xs text-[color:var(--fg-warning)] hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}