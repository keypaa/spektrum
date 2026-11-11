"use client";

import { useEffect, useState } from "react";
import { setThemePreferenceAction } from "@/lib/actions";
import type { ThemePreference } from "@spektrum/ui";

const KEY = "crixet_light_mode_preference_v1";

function apply(value: ThemePreference): void {
  const isDark =
    value === "dark" ||
    (value === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const html = document.documentElement;
  html.classList.toggle("dark", isDark);
  html.dataset.theme = isDark ? "dark" : "light";
  html.dataset.themePreference = value;
  html.style.colorScheme = isDark ? "dark" : "light";
}

export function useThemePreference(): {
  value: ThemePreference;
  set: (value: ThemePreference) => void;
} {
  const [value, setValue] = useState<ThemePreference>("dark");

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setValue(stored);
      apply(stored);
    }
  }, []);

  const set = (next: ThemePreference) => {
    setValue(next);
    localStorage.setItem(KEY, next);
    apply(next);
    void setThemePreferenceAction(next);
  };

  return { value, set };
}
