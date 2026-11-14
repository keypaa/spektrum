// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSidebar } from "./project-sidebar";
import type { DocumentSummary } from "@/lib/documents";

// The account chip's menu uses the Next router (sign-out); jsdom has none.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

const DOCS: DocumentSummary[] = [
  { id: "d2", path: "refs.bib", kind: "bib", updatedAt: "2026-11-12T10:00:00.000Z" },
  { id: "d1", path: "main.tex", kind: "tex", updatedAt: "2026-11-12T10:00:00.000Z" },
];

function renderSidebar(overrides: Partial<React.ComponentProps<typeof ProjectSidebar>> = {}) {
  const props = {
    project: { id: "p1", name: "My Project" },
    documents: DOCS,
    activePath: "main.tex" as string | null,
    activeSection: "files" as "files" | "chats",
    onSectionChange: vi.fn(),
    onOpenDocument: vi.fn(),
    onNewFile: vi.fn(),
    onRenameDocument: vi.fn(),
    onDeleteDocument: vi.fn(),
    onDownloadDocument: vi.fn(),
    onOpenSettings: vi.fn(),
    threads: [],
    activeThreadId: null as string | null,
    aiEnabled: true,
    chatBusy: false,
    onNewChat: vi.fn(),
    onSelectThread: vi.fn(),
    onRenameThread: vi.fn(),
    onDeleteThread: vi.fn(),
    onRegenerateThread: vi.fn(),
    user: { name: "Keylhan Paumard", email: "owner@spektrum.local" },
    ...overrides,
  };
  // Stateful wrapper: the section is controlled, so the harness owns the state
  // the way the editor client does.
  function Harness() {
    const [section, setSection] = useState<"files" | "chats">(props.activeSection);
    return (
      <ProjectSidebar
        {...props}
        activeSection={section}
        onSectionChange={(s) => {
          props.onSectionChange(s);
          setSection(s);
        }}
      />
    );
  }
  return { ...render(<Harness />), props };
}

describe("ProjectSidebar", () => {
  it("renders the project name, Files active, one row per document sorted by path", () => {
    renderSidebar();
    expect(screen.getByText("My Project")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Files" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Chats" }).getAttribute("aria-selected")).toBe("false");
    const rows = screen.getAllByTestId(/^file-row-/).map((n) => n.textContent);
    expect(rows).toEqual(["main.tex", "refs.bib"]);
  });

  it("hides files matching hiddenFiles, case-sensitively per glob", () => {
    renderSidebar({
      documents: [
        ...DOCS,
        { id: "d3", path: "main.aux", kind: "other", updatedAt: "2026-11-12T10:00:00.000Z" },
      ],
      hiddenFiles: ["*.aux"],
    });
    expect(screen.queryByText("main.aux")).toBeNull();
    expect(screen.getByText("main.tex")).toBeTruthy();
  });

  it("the search button reveals an input; typing filters case-insensitively", async () => {
    const { props } = renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    const input = screen.getByRole("textbox", { name: "Search" });
    await userEvent.type(input, "MAIN");
    expect(screen.getByText("main.tex")).toBeTruthy();
    expect(screen.queryByText("refs.bib")).toBeNull();
    expect(props.onOpenDocument).not.toHaveBeenCalled();
  });

  it("shows the no-match message when nothing matches", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search" }), "zzz");
    expect(screen.getByText("No files match your search.")).toBeTruthy();
  });

  it("clicking a row calls onOpenDocument(path); the active row has aria-current", async () => {
    const { props } = renderSidebar();
    await userEvent.click(screen.getByText("refs.bib"));
    expect(props.onOpenDocument).toHaveBeenCalledWith("refs.bib");
    expect(screen.getByText("main.tex").closest("[aria-current]")?.getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("the Chats tab shows the empty message; the plus is section-aware", async () => {
    const { props } = renderSidebar();
    await userEvent.click(screen.getByRole("tab", { name: "Chats" }));
    expect(screen.getByText("No chats yet")).toBeTruthy();
    // On Chats the + starts a new chat, not a new file.
    await userEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(props.onNewChat).toHaveBeenCalled();
    expect(props.onNewFile).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("tab", { name: "Files" }));
    await userEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(props.onNewFile).toHaveBeenCalled();
  });

  it("renders the chat threads in the Chats branch, newest first", async () => {
    const { props } = renderSidebar({
      activeSection: "chats",
      threads: [
        { id: "t1", title: "Older chat", titleSource: "llm", hasAssistantReply: true, createdAt: "2026-11-10T10:00:00.000Z" },
        { id: "t2", title: "Newer chat", titleSource: "fallback", hasAssistantReply: true, createdAt: "2026-11-12T10:00:00.000Z" },
      ],
      activeThreadId: "t2",
    });
    expect(props.onNewChat).toBeDefined();
    const rows = screen.getAllByTestId(/^chat-row-/).map((n) => n.textContent);
    expect(rows).toEqual(["Newer chat", "Older chat"]);
    await userEvent.click(screen.getByText("Older chat"));
    expect(props.onSelectThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1" }),
    );
  });

  it("the file menu exposes Rename, Download and Delete", async () => {
    const { props } = renderSidebar();
    await userEvent.click(screen.getAllByRole("button", { name: /actions/ })[0]!);
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(props.onRenameDocument).toHaveBeenCalledWith(
      expect.objectContaining({ path: "main.tex" }),
    );
    expect(props.onDownloadDocument).not.toHaveBeenCalled();
  });

  it("the account chip shows the name and Personal workspace", () => {
    renderSidebar();
    expect(screen.getByText("Keylhan Paumard")).toBeTruthy();
    expect(screen.getByText("Personal workspace")).toBeTruthy();
  });
});