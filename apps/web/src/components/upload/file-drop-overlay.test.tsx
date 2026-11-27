// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileDropOverlay } from "./file-drop-overlay";

afterEach(cleanup);

function fileDrag(dataTransfer: Partial<DataTransfer> = {}) {
  return {
    types: ["Files"],
    files: [new File(["x"], "paper.pdf", { type: "application/pdf" })],
    ...dataTransfer,
  };
}

describe("FileDropOverlay", () => {
  it("appears while files are dragged and disappears on drop", () => {
    const onFiles = vi.fn();
    render(<FileDropOverlay onFiles={onFiles} />);
    const transfer = fileDrag();

    fireEvent.dragEnter(window, { dataTransfer: transfer });
    expect(screen.getByTestId("file-drop-overlay")).toBeTruthy();

    fireEvent.dragOver(window, { dataTransfer: transfer });
    expect(screen.getByTestId("file-drop-overlay")).toBeTruthy();

    fireEvent.drop(window, { dataTransfer: transfer });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0]![0]).toHaveLength(1);
    expect(screen.queryByTestId("file-drop-overlay")).toBeNull();
  });

  it("hides when the drag leaves the window", () => {
    render(<FileDropOverlay onFiles={vi.fn()} />);
    const transfer = fileDrag();

    fireEvent.dragEnter(window, { dataTransfer: transfer });
    expect(screen.getByTestId("file-drop-overlay")).toBeTruthy();
    fireEvent.dragLeave(window, { dataTransfer: transfer });
    expect(screen.queryByTestId("file-drop-overlay")).toBeNull();
  });

  it("does not hand over files that exceed the workspace cap", () => {
    const onFiles = vi.fn();
    render(<FileDropOverlay onFiles={onFiles} />);
    const huge = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(huge, "size", { value: 31 * 1024 * 1024 });
    const small = fileDrag().files[0]!;

    fireEvent.drop(window, {
      dataTransfer: { types: ["Files"], files: [huge, small] },
    });

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0]![0]).toEqual([small]);
  });

  it("ignores drags that carry no files", () => {
    const onFiles = vi.fn();
    render(<FileDropOverlay onFiles={onFiles} />);
    const transfer = { types: ["text/plain"], files: [] };

    fireEvent.dragEnter(window, { dataTransfer: transfer });
    fireEvent.drop(window, { dataTransfer: transfer });

    expect(screen.queryByTestId("file-drop-overlay")).toBeNull();
    expect(onFiles).not.toHaveBeenCalled();
  });
});
