// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewFileDialog } from "./new-file-dialog";

afterEach(cleanup);

describe("NewFileDialog", () => {
  it("submits notes as notes.tex when there is no extension", async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <NewFileDialog
        open
        existingPaths={["main.tex"]}
        onSubmit={onSubmit}
        onOpenChange={() => {}}
      />,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "File name" }), "notes");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onSubmit).toHaveBeenCalledWith("notes.tex");
  });

  it("keeps an explicit extension as typed", async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <NewFileDialog
        open
        existingPaths={[]}
        onSubmit={onSubmit}
        onOpenChange={() => {}}
      />,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "File name" }), "refs.bib");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onSubmit).toHaveBeenCalledWith("refs.bib");
  });

  it("shows the duplicate message when the name already exists", async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <NewFileDialog
        open
        existingPaths={["main.tex"]}
        onSubmit={onSubmit}
        onOpenChange={() => {}}
      />,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "File name" }), "main.tex");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "A file with that name already exists.",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Create is disabled while empty", () => {
    render(
      <NewFileDialog
        open
        existingPaths={[]}
        onSubmit={vi.fn(async () => {})}
        onOpenChange={() => {}}
      />,
    );
    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(true);
  });
});