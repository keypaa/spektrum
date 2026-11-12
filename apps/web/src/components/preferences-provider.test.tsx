// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@spektrum/shared/preferences";
import { THEME_STORAGE_KEY } from "./theme-script";
import { PreferencesProvider, usePreferences } from "./preferences-provider";

afterEach(cleanup);

function Probe({ onStatus }: { onStatus?: (s: string) => void }) {
  const { preferences, setPreference, status } = usePreferences();
  onStatus?.(status);
  return (
    <div>
      <span data-testid="theme">{preferences.interfaceTheme}</span>
      <span data-testid="font">{String(preferences.editorFontSize)}</span>
      <button onClick={() => setPreference("vimMode", true)}>vim</button>
      <button onClick={() => setPreference("editorFontSize", 16)}>font</button>
      <button onClick={() => setPreference("interfaceTheme", "dark")}>dark</button>
    </div>
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
  document.documentElement.style.colorScheme = "";
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

function putCalls() {
  return fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).includes("/api/user/preferences") && init?.method === "PUT",
  );
}

describe("PreferencesProvider", () => {
  it("exposes the server value and never reads spektrum_preferences_v1", () => {
    localStorage.setItem("spektrum_preferences_v1", JSON.stringify({ vimMode: true }));
    render(
      <PreferencesProvider initial={{ ...DEFAULT_PREFERENCES, editorFontSize: 15 }}>
        <Probe />
      </PreferencesProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(screen.getByTestId("font").textContent).toBe("15");
  });

  it("coalesces three rapid setPreference calls into one PUT after 300 ms", async () => {
    vi.useFakeTimers();
    render(
      <PreferencesProvider initial={DEFAULT_PREFERENCES}>
        <Probe />
      </PreferencesProvider>,
    );

    const font = screen.getByText("font");
    const vim = screen.getByText("vim");
    act(() => {
      font.click();
      vim.click();
      font.click();
    });
    expect(putCalls()).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(putCalls()).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(putCalls()).toHaveLength(1);

    const body = JSON.parse(putCalls()[0]![1]!.body as string);
    expect(body.vimMode).toBe(true);
    expect(body.editorFontSize).toBe(16);
    vi.useRealTimers();
  });

  it("mirrors only interfaceTheme to the pre-paint key", async () => {
    vi.useFakeTimers();
    render(
      <PreferencesProvider initial={DEFAULT_PREFERENCES}>
        <Probe />
      </PreferencesProvider>,
    );

    act(() => {
      screen.getByText("vim").click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

    act(() => {
      screen.getByText("dark").click();
    });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    vi.useRealTimers();
  });

  it("applies the DOM attributes when the theme changes", () => {
    render(
      <PreferencesProvider initial={DEFAULT_PREFERENCES}>
        <Probe />
      </PreferencesProvider>,
    );
    act(() => {
      screen.getByText("dark").click();
    });
    const html = document.documentElement;
    expect(html.classList.contains("dark")).toBe(true);
    expect(html.dataset.theme).toBe("dark");
    expect(html.dataset.themePreference).toBe("dark");
    expect(html.style.colorScheme).toBe("dark");
  });

  it("sets status error on a failed PUT and keeps the local value", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => new Response("boom", { status: 500 }));
    const seen: string[] = [];
    render(
      <PreferencesProvider initial={DEFAULT_PREFERENCES}>
        <Probe onStatus={(s) => seen.push(s)} />
      </PreferencesProvider>,
    );

    act(() => {
      screen.getByText("vim").click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(seen).toContain("error");
    expect(screen.getByTestId("theme").textContent).toBe("system");
    vi.useRealTimers();
  });
});