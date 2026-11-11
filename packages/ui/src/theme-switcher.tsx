"use client";

import { cn } from "./lib/cn";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "crixet_light_mode_preference_v1";

export function ThemeSwitcher({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Interface theme"
      className="inline-flex items-center gap-1 rounded-full bg-input-bg p-1"
    >
      {(["light", "dark", "system"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "h-8 rounded-full px-3 text-sm",
            value === option
              ? "bg-optionmenu-bg-hover text-fg-primary"
              : "text-fg-tertiary hover:text-fg-secondary",
          )}
        >
          {option === "light" ? "Light" : option === "dark" ? "Dark" : "System"}
        </button>
      ))}
    </div>
  );
}
