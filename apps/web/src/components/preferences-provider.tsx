"use client";

// The client preferences context (spec §9.7/§19.5, D38).
//
// The server row is authoritative: `initial` comes from the RSC layout, and a
// local change is debounced into one `PUT /api/user/preferences` with the full
// object. No full local mirror exists. The single exception is
// `interfaceTheme`, which is also written to the pre-paint key
// (`crixet_light_mode_preference_v1`) so the inline <head> script can pick the
// right theme before hydration — and applied to the DOM immediately, because a
// theme that waits 300 ms to change is a visible flicker.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Preferences } from "@spektrum/shared/preferences";
import { THEME_STORAGE_KEY, type ThemePreference } from "./theme-script";

const DEBOUNCE_MS = 300;

export type PreferenceStatus = "idle" | "saving" | "error";

export function applyTheme(value: ThemePreference): void {
  const isDark =
    value === "dark" ||
    (value === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const html = document.documentElement;
  html.classList.toggle("dark", isDark);
  html.dataset.theme = isDark ? "dark" : "light";
  html.dataset.themePreference = value;
  html.style.colorScheme = isDark ? "dark" : "light";
  localStorage.setItem(THEME_STORAGE_KEY, value);
}

interface PreferencesContextValue {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  status: PreferenceStatus;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({
  initial,
  children,
}: {
  initial: Preferences;
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState<Preferences>(initial);
  const [status, setStatus] = useState<PreferenceStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Preferences | null>(null);
  // The value the next flush should send. The debounce resets on every edit, so
  // only the latest object is ever written.
  const latest = useRef<Preferences>(initial);

  const flush = useCallback(
    async (keepalive = false) => {
      const body = pending.current;
      pending.current = null;
      if (!body) return;
      setStatus("saving");
      try {
        const res = await fetch("/api/user/preferences", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          ...(keepalive ? { keepalive: true } : {}),
        });
        if (!res.ok) throw new Error(`PUT preferences -> ${res.status}`);
        setStatus("idle");
      } catch {
        // The local value stays; the next edit re-saves the whole object.
        setStatus("error");
      }
    },
    [],
  );

  const setPreference = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      const next = { ...latest.current, [key]: value };
      latest.current = next;
      setPreferences(next);
      if (key === "interfaceTheme") applyTheme(value as ThemePreference);
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, DEBOUNCE_MS);
    },
    [flush],
  );

  // Flush on pagehide so a tab close mid-debounce does not lose the edit.
  useEffect(() => {
    const onHide = () => {
      if (timer.current) clearTimeout(timer.current);
      void flush(true);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (timer.current) clearTimeout(timer.current);
      void flush(true);
    };
  }, [flush]);

  const value = useMemo(
    () => ({ preferences, setPreference, status }),
    [preferences, setPreference, status],
  );
  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}