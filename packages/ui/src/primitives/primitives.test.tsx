import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Input } from "./input";
import * as DropdownMenu from "./dropdown-menu";
import * as Dialog from "./dialog";

// Dependency-free per the plan: `react-dom/server` only. Radix portals render
// null on the server, so the Radix wrappers are asserted as component exports
// plus server-renderability (renderToStaticMarkup must not throw); Task 16
// adds @testing-library/react when a DOM is actually needed.

const isComponent = (value: unknown) =>
  typeof value === "function" || (typeof value === "object" && value !== null);

describe("cn", () => {
  it("merges conflicting tailwind classes (last wins)", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("Button", () => {
  it("renders a <button> with variant/size classes and forwards aria-label", () => {
    const html = renderToStaticMarkup(
      <Button variant="secondary" size="sm" aria-label="Import" />,
    );
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Import"');
    expect(html).toContain("bg-button-secondary-bg");
    expect(html).toContain("h-8");
    expect(html).toContain("px-3");
    expect(html).toContain("disabled:opacity-50");
  });

  it("defaults to primary/md (h-9 px-4) and merges className via cn", () => {
    const html = renderToStaticMarkup(<Button className="px-8">New</Button>);
    expect(html).toContain("bg-button-primary-bg");
    expect(html).toContain("text-button-primary-text");
    expect(html).toContain("h-9");
    expect(html).toContain("px-8"); // tailwind-merge keeps the override, drops px-4
    expect(html).not.toContain("px-4");
  });

  it("ghost variant is transparent with tertiary text", () => {
    const html = renderToStaticMarkup(<Button variant="ghost">Row</Button>);
    expect(html).toContain("bg-transparent");
    expect(html).toContain("text-button-tertiary-text");
  });
});

describe("Input", () => {
  it("forwards aria-label and placeholder with the bundle classes", () => {
    const html = renderToStaticMarkup(
      <Input aria-label="Document title" placeholder="Untitled" />,
    );
    expect(html).toContain("<input");
    expect(html).toContain('aria-label="Document title"');
    expect(html).toContain('placeholder="Untitled"');
    expect(html).toContain("h-10");
    expect(html).toContain("border-input");
    expect(html).toContain("bg-background");
  });
});

describe("DropdownMenu wrappers", () => {
  it("exports the expected components incl. DropdownMenuSeparator", () => {
    const exports = DropdownMenu as Record<string, unknown>;
    for (const name of [
      "DropdownMenu",
      "DropdownMenuTrigger",
      "DropdownMenuContent",
      "DropdownMenuItem",
      "DropdownMenuSeparator",
    ]) {
      expect(isComponent(exports[name]), name).toBe(true);
    }
  });

  it("server-renders an open menu without throwing", () => {
    const html = renderToStaticMarkup(
      <DropdownMenu.DropdownMenu open>
        <DropdownMenu.DropdownMenuTrigger>Actions</DropdownMenu.DropdownMenuTrigger>
        <DropdownMenu.DropdownMenuContent>
          <DropdownMenu.DropdownMenuItem>Rename</DropdownMenu.DropdownMenuItem>
          <DropdownMenu.DropdownMenuSeparator />
          <DropdownMenu.DropdownMenuItem>Delete</DropdownMenu.DropdownMenuItem>
        </DropdownMenu.DropdownMenuContent>
      </DropdownMenu.DropdownMenu>,
    );
    // The trigger renders on the server; the portal content does not.
    expect(html).toContain("Actions");
  });
});

describe("Dialog wrappers", () => {
  it("exports the expected components", () => {
    const exports = Dialog as Record<string, unknown>;
    for (const name of [
      "Dialog",
      "DialogTrigger",
      "DialogTitle",
      "DialogDescription",
      "DialogContent",
      "DialogHeader",
      "DialogFooter",
      "DialogAction",
      "DialogCancel",
    ]) {
      expect(isComponent(exports[name]), name).toBe(true);
    }
  });

  it("server-renders an open dialog without throwing", () => {
    const html = renderToStaticMarkup(
      <Dialog.Dialog open>
        <Dialog.DialogTrigger>Open</Dialog.DialogTrigger>
        <Dialog.DialogContent>
          <Dialog.DialogHeader>
            <Dialog.DialogTitle>Delete document</Dialog.DialogTitle>
            <Dialog.DialogDescription>This cannot be undone.</Dialog.DialogDescription>
          </Dialog.DialogHeader>
          <Dialog.DialogFooter>
            <Dialog.DialogCancel>Cancel</Dialog.DialogCancel>
            <Dialog.DialogAction>Delete</Dialog.DialogAction>
          </Dialog.DialogFooter>
        </Dialog.DialogContent>
      </Dialog.Dialog>,
    );
    expect(html).toContain("Open");
  });
});
