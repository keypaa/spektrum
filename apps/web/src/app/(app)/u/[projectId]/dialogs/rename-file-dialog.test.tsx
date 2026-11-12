// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenameFileDialog } from "./rename-file-dialog";
import { DeleteFileDialog } from "./delete-file-dialog";
import type { DocumentSummary } from "@/lib/documents";

afterEach(cleanup);

const DOC: DocumentSummary = {
  id: "d1",
  path: "main.tex",
  kind: "tex",
  updatedAt: "2026-11-12T10:00:00.000Z",
};

describe("RenameFileDialog", () => {
  it("pre-fills the current path and Save is disabled while unchanged", () => {
    render(
      <RenameFileDialog
        document={DOC}
        existingPaths={[DOC.path]}
        onSubmit={vi.fn(async () => {})}
        onOpenChange={() => {}}
      />,
    );
    expect((screen.getByRole("textbox", { name: "File name" }) as HTMLInputElement).value).toBe("main.tex");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits the new path", async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <RenameFileDialog
        document={DOC}
        existingPaths={[DOC.path, "other.tex"]}
        onSubmit={onSubmit}
        onOpenChange={() => {}}
      />,
    );
    const input = screen.getByRole("textbox", { name: "File name" });
    await userEvent.clear(input);
    await userEvent.type(input, "notes2.tex");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith("notes2.tex");
  });

  it("shows the duplicate message when the target exists", async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <RenameFileDialog
        document={DOC}
        existingPaths={[DOC.path, "other.tex"]}
        onSubmit={onSubmit}
        onOpenChange={() => {}}
      />,
    );
    const input = screen.getByRole("textbox", { name: "File name" });
    await userEvent.clear(input);
    await userEvent.type(input, "other.tex");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "A file with that name already exists.",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("DeleteFileDialog", () => {
  it("Delete is the primary action and Cancel closes", async () => {
    const onConfirm = vi.fn(async () => {});
    const onOpenChange = vi.fn();
    render(
      <DeleteFileDialog document={DOC} onConfirm={onConfirm} onOpenChange={onOpenChange} />,
    );
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});