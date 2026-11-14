// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Versions } from "./versions";

afterEach(cleanup);

const rows = [
  {
    id: "1",
    batchId: "b1",
    documentId: "d1",
    path: "main.tex",
    createdAt: new Date(),
    author: "Keylhan",
  },
  {
    id: "2",
    batchId: "b1",
    documentId: "d2",
    path: "refs.bib",
    createdAt: new Date(),
    author: "Keylhan",
  },
  {
    id: "3",
    batchId: "b2",
    documentId: "d1",
    path: "main.tex",
    createdAt: new Date(Date.now() - 60_000),
    author: "Keylhan",
  },
];

describe("Versions", () => {
  it("groups snapshots by compile batch", () => {
    render(<Versions rows={rows} onRestore={vi.fn()} />);
    expect(screen.getAllByText("Edited workspace")).toHaveLength(2);
    expect(screen.getByText("Showing 2 versions")).toBeTruthy();
  });

  it("restores the batch", () => {
    const onRestore = vi.fn();
    render(<Versions rows={rows} onRestore={onRestore} />);
    fireEvent.click(screen.getAllByText("Restore")[0]!);
    expect(onRestore).toHaveBeenCalledWith("b1");
  });

  it("shows the empty state", () => {
    render(<Versions rows={[]} onRestore={vi.fn()} />);
    expect(screen.getByText("No versions yet")).toBeTruthy();
  });
});