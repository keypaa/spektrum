// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { ThemeSwitcher } from "./theme-switcher";

afterEach(() => {
  cleanup();
});

describe("ThemeSwitcher", () => {
  it("renders all three options with the exact labels and a radiogroup container", () => {
    render(<ThemeSwitcher value="dark" onChange={() => {}} />);

    expect(screen.getByRole("radiogroup", { name: "Interface theme" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Light" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "System" })).toBeTruthy();
  });

  it("marks the selected option with aria-checked true and role radio", () => {
    render(<ThemeSwitcher value="system" onChange={() => {}} />);

    const light = screen.getByRole("radio", { name: "Light" });
    const dark = screen.getByRole("radio", { name: "Dark" });
    const system = screen.getByRole("radio", { name: "System" });

    expect(light.getAttribute("aria-checked")).toBe("false");
    expect(dark.getAttribute("aria-checked")).toBe("false");
    expect(system.getAttribute("aria-checked")).toBe("true");
  });

  it("calls onChange with the clicked option value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemeSwitcher value="dark" onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(onChange).toHaveBeenCalledWith("light");

    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(onChange).toHaveBeenCalledWith("system");
  });
});
