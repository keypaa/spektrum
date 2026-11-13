"use client";

// Editor tabs: a pure reducer plus per-project localStorage persistence
// (spec §7.5's tab strip behaviour). The storage key carries a schema version
// so a later change can migrate rather than crash on corrupt JSON.

export interface TabsState {
  open: string[];
  active: string | null;
}

export type TabsAction =
  | { type: "open"; path: string }
  | { type: "close"; path: string }
  | { type: "activate"; path: string }
  | { type: "rename"; from: string; to: string }
  | { type: "sync"; paths: string[] };

export const EMPTY_TABS: TabsState = { open: [], active: null };

export function tabsStorageKey(projectId: string): string {
  return `spektrum_editor_tabs_v1:${projectId}`;
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "open": {
      if (state.open.includes(action.path)) {
        return { ...state, active: action.path };
      }
      return { open: [...state.open, action.path], active: action.path };
    }

    case "close": {
      const open = state.open.filter((p) => p !== action.path);
      if (state.active !== action.path) return { ...state, open };
      const index = state.open.indexOf(action.path);
      const next = open[index] ?? open[index - 1] ?? null;
      return { open, active: next };
    }

    case "activate":
      return state.open.includes(action.path)
        ? { ...state, active: action.path }
        : state;

    case "rename": {
      const open = state.open.map((p) => (p === action.from ? action.to : p));
      return {
        open,
        active: state.active === action.from ? action.to : state.active,
      };
    }

    case "sync": {
      const known = new Set(action.paths);
      const open = state.open.filter((p) => known.has(p));
      const active = state.active && known.has(state.active) ? state.active : null;
      return { open, active };
    }
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isTabsState(value: unknown): value is TabsState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isStringArray(v.open) && (typeof v.active === "string" || v.active === null)
  );
}

export function readTabs(projectId: string): TabsState {
  try {
    const raw = localStorage.getItem(tabsStorageKey(projectId));
    if (raw === null) return EMPTY_TABS;
    const parsed: unknown = JSON.parse(raw);
    return isTabsState(parsed) ? parsed : EMPTY_TABS;
  } catch {
    return EMPTY_TABS;
  }
}

export function writeTabs(projectId: string, state: TabsState): void {
  try {
    localStorage.setItem(tabsStorageKey(projectId), JSON.stringify(state));
  } catch {
    // A full or disabled localStorage must not break tab switching.
  }
}