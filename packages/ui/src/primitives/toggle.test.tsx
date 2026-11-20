// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toggle } from "./toggle";

afterEach(cleanup);

function thumb(): HTMLElement {
  return document.querySelector("button[role='switch'] > span") as HTMLElement;
}

describe("Toggle", () => {
  it("centers the thumb on both axes of the track", () => {
    render(<Toggle label="Code" checked onCheckedChange={vi.fn()} />);
    const handle = thumb();
    // Vertical: top-1/2 + -translate-y-1/2 centres 16px inside the 18px
    // padding box. Horizontal: 2px margin on either side when checked.
    expect(handle.className).toContain("top-1/2");
    expect(handle.className).toContain("-translate-y-1/2");
    expect(handle.className).toContain("left-0.5");
    expect(handle.className).toContain("group-aria-checked:left-[16px]");
  });

  it("still flips on click", () => {
    const onChange = vi.fn();
    render(<Toggle label="PDF" checked={false} onCheckedChange={onChange} />);
    screen.getByRole("switch", { name: "PDF" }).click();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
