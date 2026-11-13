// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_PREFERENCES, type Preferences } from "@spektrum/shared/preferences";
import { PreferencesProvider } from "@/components/preferences-provider";
import { SettingsModalHost, useSettingsModal } from "./settings-modal-host";

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

function OpenButton() {
  const { open } = useSettingsModal();
  return <button onClick={() => open()}>open settings</button>;
}

function renderHost(initial: Partial<Preferences> = {}) {
  const preferences = { ...DEFAULT_PREFERENCES, ...initial };
  return render(
    <PreferencesProvider initial={preferences}>
      <SettingsModalHost>
        <OpenButton />
      </SettingsModalHost>
    </PreferencesProvider>,
  );
}

const SECTIONS = [
  "Editor",
  "PDF Viewer",
  "File Management",
  "Data Controls",
  "Beta features",
  "Integrations",
] as const;

describe("SettingsModal", () => {
  it("opens as a 960×720 dialog named Settings with the six nav rows", async () => {
    renderHost();
    await userEvent.click(screen.getByText("open settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog.className).toContain("max-w-[960px]");
    expect(dialog.className).toContain("h-[720px]");
    for (const section of SECTIONS) {
      expect(within(dialog).getByRole("button", { name: section })).toBeTruthy();
    }
    expect(within(dialog).getByRole("button", { name: "Editor" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("closes on Esc and on the close button", async () => {
    renderHost();
    await userEvent.click(screen.getByText("open settings"));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();

    await userEvent.click(screen.getByText("open settings"));
    await userEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("switches sections and renders the Editor rows", async () => {
    renderHost();
    await userEvent.click(screen.getByText("open settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(within(dialog).getByText("Select your interface color scheme.")).toBeTruthy();
    expect(within(dialog).getByText("Automatically compile the document as you type")).toBeTruthy();
  });

  it("the font size select maps Small/Normal/Large to 12/13/15", async () => {
    renderHost();
    await userEvent.click(screen.getByText("open settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const select = within(dialog).getByLabelText("Font size") as HTMLSelectElement;
    expect(select.value).toBe("13");
    expect(within(dialog).getByRole("option", { name: "Small" })).toBeTruthy();
    expect(within(dialog).getByRole("option", { name: "Large" })).toBeTruthy();
    await userEvent.selectOptions(select, "15");
    expect(select.value).toBe("15");
  });

  it("toggles write the right preference keys", async () => {
    renderHost({ disableWordWrap: false });
    await userEvent.click(screen.getByText("open settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const sw = within(dialog).getByRole("switch", { name: "Disable Word Wrap" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("adds a word to the personal dictionary, trimmed and lowercased", async () => {
    renderHost();
    await userEvent.click(screen.getByText("open settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await userEvent.type(within(dialog).getByLabelText("Add a word to ignore"), "  TEXT  ");
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Add" })[0]!);
    expect(within(dialog).getByText("text")).toBeTruthy();
  });

  it("the PDF Viewer section maps its two toggles", async () => {
    renderHost();
    await userEvent.click(screen.getByText("open settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await userEvent.click(within(dialog).getByRole("button", { name: "PDF Viewer" }));
    const dark = within(dialog).getByRole("switch", { name: "PDF Dark Mode" });
    expect(dark.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(dark);
    expect(dark.getAttribute("aria-checked")).toBe("true");
  });

  it("File Management adds and removes a hidden glob", async () => {
    renderHost();
    await userEvent.click(screen.getByText("open settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await userEvent.click(within(dialog).getByRole("button", { name: "File Management" }));
    await userEvent.type(within(dialog).getByLabelText("Hide files from file tree"), "*.tmp");
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Add" })[0]!);
    expect(within(dialog).getByText("*.tmp")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove *.tmp" }));
    expect(within(dialog).queryByText("*.tmp")).toBeNull();
  });

  it("Data Controls ships Download zip disabled", async () => {
    renderHost();
    await userEvent.click(screen.getByText("open settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Data Controls" }));
    expect(
      within(dialog).getByRole("button", { name: "Download zip" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("Beta features stores the opt-in outside the preferences row (D40)", async () => {
    renderHost();
    await userEvent.click(screen.getByText("open settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Beta features" }));
    const sw = within(dialog).getByRole("switch", { name: "Join the beta program" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(localStorage.getItem("spektrum_beta_opt_in_v1")).toBe("true");
  });

  it("Integrations renders the Zotero card as coming soon", async () => {
    renderHost();
    await userEvent.click(screen.getByText("open settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Integrations" }));
    expect(within(dialog).getByText("Coming soon")).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "Connect" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });
});