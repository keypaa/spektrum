"use client";

import { usePreferences } from "@/components/preferences-provider";
import type { ThemePreference } from "@spektrum/ui";

export { THEME_STORAGE_KEY } from "./theme-script";

/**
 * The theme control, rewrapped over the preferences context (D38): the value
 * comes from the server row, and a change goes through `setPreference`, which
 * applies the DOM attributes and debounces the PUT.
 */
export function useThemePreference(): {
  value: ThemePreference;
  set: (value: ThemePreference) => void;
} {
  const { preferences, setPreference } = usePreferences();
  return {
    value: preferences.interfaceTheme,
    set: (value) => setPreference("interfaceTheme", value),
  };
}