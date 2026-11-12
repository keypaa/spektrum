// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@spektrum/shared/preferences";
import { PreferencesProvider } from "./preferences-provider";
import { useThemePreference } from "./theme-preference";
import { THEME_STORAGE_KEY as SCRIPT_KEY } from "./theme-script";
import { THEME_STORAGE_KEY as SWITCHER_KEY } from "@spektrum/ui";

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
});

it("exposes the server value and delegates set to the provider", async () => {
  const seen: string[] = [];
  function Probe() {
    const { value, set } = useThemePreference();
    seen.push(value);
    return <button onClick={() => set("light")}>light</button>;
  }
  render(
    <PreferencesProvider initial={{ ...DEFAULT_PREFERENCES, interfaceTheme: "dark" }}>
      <Probe />
    </PreferencesProvider>,
  );
  expect(seen.at(-1)).toBe("dark");

  act(() => {
    document.querySelector("button")!.click();
  });
  expect(seen.at(-1)).toBe("light");
  expect(localStorage.getItem(SCRIPT_KEY)).toBe("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});

it("keeps the two THEME_STORAGE_KEY literals in sync", () => {
  expect(SCRIPT_KEY).toBe(SWITCHER_KEY);
  expect(SCRIPT_KEY).toBe("crixet_light_mode_preference_v1");
});