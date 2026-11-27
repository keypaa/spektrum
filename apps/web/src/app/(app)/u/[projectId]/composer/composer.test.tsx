// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatImageRef, ImageSupportPreference } from "@spektrum/shared/ai";
import type { ImageSupport } from "@/lib/ai/model-capabilities";
import { uploadBytesToR2 } from "@/lib/upload/client";
import { Composer } from "./composer";
import { readPastedImages } from "./image-paste";
import type { useChat } from "./use-chat";

import type { ComponentProps } from "react";
import type { DocumentSummary } from "@/lib/documents";

type UploadedRef = ChatImageRef & { previewUrl: string };

const pasteState = vi.hoisted(() => ({
  files: [] as UploadedRef[],
}));

// The paste decoder is covered in image-paste.test.ts; here we only need its
// output so the component test stays about thumbnails, removal and sending.
vi.mock("./image-paste", () => ({
  readPastedImages: vi.fn(async () => pasteState.files),
}));

vi.mock("@/lib/upload/client", () => ({
  uploadBytesToR2: vi.fn(async () => "u/u1/chat-image/uploaded.png"),
}));

beforeEach(() => {
  pasteState.files = [];
  vi.mocked(uploadBytesToR2).mockClear();
  vi.mocked(readPastedImages).mockClear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:local-image"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(cleanup);

const DOCS: DocumentSummary[] = [
  { id: "d1", path: "main.tex", kind: "tex", updatedAt: "2026-01-01" },
  { id: "d2", path: "paper.pdf", kind: "img", updatedAt: "2026-01-01" },
];

const SELECTION = { path: "main.tex", startLine: 55, endLine: 112 };

const baseChat = {
  projectId: "p1",
  threadId: null,
  parts: [],
  status: "idle" as const,
  error: null,
  imageRejected: false,
  send: vi.fn(),
  loadThread: vi.fn(),
  reset: vi.fn(),
  setDiffStatus: vi.fn(),
  stop: vi.fn(),
  retry: vi.fn(),
  rerun: vi.fn(),
};

function renderComposer(
  overrides: Partial<ReturnType<typeof useChat>> = {},
  aiEnabled = true,
  imageSupport?: ImageSupport,
  imageSupportOverride?: ImageSupportPreference,
) {
  const onReview = vi.fn();
  const onUploadFiles = vi.fn();
  const chat = { ...baseChat, ...overrides };
  render(
    <Composer
      chat={chat}
      aiEnabled={aiEnabled}
      onReview={onReview}
      onUploadFiles={onUploadFiles}
      onReviewDiff={vi.fn()}
      imageSupport={imageSupport}
      imageSupportOverride={imageSupportOverride}
    />,
  );
  return { onReview, onUploadFiles, chat };
}

function renderPinned(
  overrides: Partial<ComponentProps<typeof Composer>> = {},
) {
  const onClearSelection = vi.fn();
  const onNavigateToSelection = vi.fn();
  const beforeSend = vi.fn(async () => undefined);
  const chat = { ...baseChat, send: vi.fn() };
  const props: ComponentProps<typeof Composer> = {
    chat,
    aiEnabled: true,
    onReview: vi.fn(),
    onUploadFiles: vi.fn(),
    onReviewDiff: vi.fn(),
    documents: DOCS,
    selection: null,
    onClearSelection,
    onNavigateToSelection,
    beforeSend,
    ...overrides,
  };
  const view = render(<Composer {...props} />);
  return { ...view, props, chat, onClearSelection, onNavigateToSelection, beforeSend };
}

describe("Composer context chips", () => {
  it("opens an @ dropdown filtered to workspace files and pins the choice", async () => {
    renderPinned();
    const area = screen.getByLabelText("Ask anything");
    await userEvent.type(area, "@mai");
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("listbox").className).toContain("max-h-40");
    await userEvent.click(screen.getByRole("option", { name: /main.tex/ }));
    expect(screen.getByTestId("pinned-file-chip").textContent).toContain("main.tex");
    expect((area as HTMLTextAreaElement).value).not.toContain("@mai");
  });

  it("shows an empty state when an @ query matches no files", async () => {
    renderPinned();
    await userEvent.type(screen.getByLabelText("Ask anything"), "@zzz");
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByText("No files match your search.")).toBeTruthy();
  });

  it("renders a selection chip and replaces it when the selection changes", async () => {
    const view = renderPinned({ selection: SELECTION });
    expect(screen.getByTestId("selection-chip").textContent).toContain("55-112");
    expect(screen.getAllByTestId("selection-chip")).toHaveLength(1);

    view.rerender(
      <Composer
        {...view.props}
        selection={{ path: "main.tex", startLine: 10, endLine: 20 }}
      />,
    );
    expect(screen.getAllByTestId("selection-chip")).toHaveLength(1);
    expect(screen.getByTestId("selection-chip").textContent).toContain("10-20");
  });

  it("keeps the chip when selection becomes empty, but removes it when the parent clears it", async () => {
    const view = renderPinned({ selection: SELECTION });
    // An empty Monaco selection leaves the parent state untouched.
    view.rerender(<Composer {...view.props} selection={SELECTION} />);
    expect(screen.getByTestId("selection-chip")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Remove selection" }));
    expect(view.onClearSelection).toHaveBeenCalled();
    view.rerender(<Composer {...view.props} selection={null} />);
    expect(screen.queryByTestId("selection-chip")).toBeNull();
  });

  it("removes the last chip on backspace in an empty textarea", async () => {
    const view = renderPinned({ selection: SELECTION });
    await userEvent.type(screen.getByLabelText("Ask anything"), "{Backspace}");
    expect(view.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("captures the selection, awaits the flush, then clears chips on send", async () => {
    let resolveFlush: (() => void) | null = null;
    const beforeSend = vi.fn(
      () => new Promise<void>((resolve) => { resolveFlush = resolve; }),
    );
    const view = renderPinned({ selection: SELECTION, beforeSend });
    await userEvent.type(screen.getByLabelText("Ask anything"), "check this{Enter}");
    expect(view.chat.send).not.toHaveBeenCalled();
    resolveFlush!();
    await vi.waitFor(() => expect(view.chat.send).toHaveBeenCalledTimes(1));
    expect(view.chat.send).toHaveBeenCalledWith(
      "check this",
      "Extra high",
      [],
      undefined,
      SELECTION,
      [],
    );
    expect(view.onClearSelection).toHaveBeenCalled();
    view.rerender(<Composer {...view.props} selection={null} />);
    expect(screen.queryByTestId("selection-chip")).toBeNull();
  });
});

describe("Composer", () => {
  it("uses the Ask anything placeholder and disables Send when empty", () => {
    renderComposer();
    expect(screen.getByLabelText("Ask anything")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Send with text and sends on Enter", async () => {
    const chat = { ...baseChat };
    renderComposer(chat);
    const area = screen.getByLabelText("Ask anything");
    await userEvent.type(area, "hello{Enter}");
    expect(chat.send).toHaveBeenCalledWith(
      "hello",
      "Extra high",
      [],
      undefined,
      undefined,
      [],
    );
  });

  it("shows Stop while streaming and calls stop", async () => {
    const chat = { ...baseChat, status: "streaming" as const };
    renderComposer(chat);
    const stop = screen.getByRole("button", { name: "Stop" });
    await userEvent.click(stop);
    expect(chat.stop).toHaveBeenCalled();
  });

  it("starts every chat at Extra high thinking", () => {
    renderComposer();
    expect(screen.getByLabelText("Thinking: Extra high")).toBeTruthy();
    expect(screen.queryByLabelText("Thinking: Medium")).toBeNull();
  });

  it("switches the thinking level", async () => {
    renderComposer();
    await userEvent.click(screen.getByLabelText("Thinking: Extra high"));
    await userEvent.click(screen.getByRole("menuitem", { name: "High" }));
    expect(screen.getByLabelText("Thinking: High")).toBeTruthy();
  });

  it("disables every AI surface without a key", () => {
    renderComposer({}, false);
    expect(screen.getByText("Add your API key in Settings")).toBeTruthy();
    expect(screen.queryByText("Review paper")).toBeNull();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the empty state and Review paper", async () => {
    const { onReview } = renderComposer();
    expect(screen.getByText("Ready when you are!")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Review paper" }));
    expect(onReview).toHaveBeenCalled();
  });

  it("the + menu offers Upload files & photos and opens a file picker", async () => {
    const { onUploadFiles } = renderComposer();
    await userEvent.click(screen.getByLabelText("Add files"));
    const item = screen.getByRole("menuitem", { name: /Upload files & photos/ });
    expect(item.hasAttribute("disabled")).toBe(false);

    const input = document.querySelector(
      'input[type="file"][multiple]',
    ) as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await userEvent.click(item);
    expect(click).toHaveBeenCalled();

    await userEvent.upload(
      input,
      new File(["x"], "paper.pdf", { type: "application/pdf" }),
    );
    expect(onUploadFiles).toHaveBeenCalledTimes(1);
    expect(onUploadFiles.mock.calls[0]![0]).toHaveLength(1);
  });

  it("renders the transcript when a thread has parts", () => {
    renderComposer({
      parts: [{ type: "text", text: "assistant reply" }],
    });
    expect(screen.getByText("assistant reply")).toBeTruthy();
    expect(screen.getByTestId("transcript-slot").className).toContain("-mr-6");
  });

  it("surfaces a failed request instead of showing nothing", () => {
    renderComposer({ error: "gateway responded 429 (rate limited)" });
    expect(screen.getByRole("alert").textContent).toContain("429");
  });

  it("offers Retry without images only after an image rejection", async () => {
    const chat = {
      ...baseChat,
      error: "image input not supported",
      imageRejected: true,
    };
    renderComposer(chat);
    const button = screen.getByTestId("retry-without-images");
    expect(button.textContent).toContain("Retry without images");
    await userEvent.click(button);
    expect(chat.retry).toHaveBeenCalledTimes(1);
  });

  it("does not offer Retry without images for an ordinary error", () => {
    renderComposer({ error: "rate limited", imageRejected: false });
    expect(screen.queryByTestId("retry-without-images")).toBeNull();
  });
});

describe("Composer image attachments", () => {
  const attachment = (id: string): UploadedRef => ({
    id,
    blobKey: `u/u1/chat-image/${id}.webp`,
    mimeType: "image/webp",
    name: "shot.webp",
    previewUrl: "blob:local-image",
  });

  function paste(area: HTMLElement): void {
    fireEvent.paste(area, {
      clipboardData: {
        items: [item(new File(["x"], "shot.png", { type: "image/png" }), "image/png")],
      },
    });
  }

  function item(file: File, type: string): DataTransferItem {
    return { kind: "file", type, getAsFile: () => file } as unknown as DataTransferItem;
  }

  it("shows pasted thumbnails and removes one on click", async () => {
    pasteState.files = [attachment("a1"), attachment("a2")];
    const { chat } = renderComposer();

    paste(screen.getByLabelText("Ask anything"));

    expect(await screen.findAllByTestId("pasted-image")).toHaveLength(2);
    await userEvent.click(screen.getAllByRole("button", { name: "Remove image" })[0]!);
    expect(screen.getAllByTestId("pasted-image")).toHaveLength(1);
    expect(chat.send).not.toHaveBeenCalled();
  });

  it("sends attachments with the message and clears the thumbnails", async () => {
    pasteState.files = [attachment("a1")];
    const { chat } = renderComposer();
    const area = screen.getByLabelText("Ask anything");
    paste(area);
    await screen.findByTestId("pasted-image");

    await userEvent.type(area, "look{Enter}");

    expect(chat.send).toHaveBeenCalledWith(
      "look",
      "Extra high",
      [],
      undefined,
      undefined,
      [attachment("a1")],
    );
    expect(screen.queryByTestId("pasted-image")).toBeNull();
  });

  it("uploads pasted bytes with kind chat-image before returning a ref", async () => {
    renderComposer();
    paste(screen.getByLabelText("Ask anything"));
    await waitFor(() => expect(readPastedImages).toHaveBeenCalledTimes(1));

    const upload = vi.mocked(readPastedImages).mock.calls[0]![1];
    const bytes = new Uint8Array([1, 2, 3]);
    const ref = await upload(bytes, "image/webp");

    expect(uploadBytesToR2).toHaveBeenCalledWith({
      bytes,
      contentType: "image/webp",
      kind: "chat-image",
      ext: "webp",
      projectId: "p1",
    });
    expect(ref.blobKey).toBe("u/u1/chat-image/uploaded.png");
    expect(ref.mimeType).toBe("image/webp");
  });

  it("does not attach pasted images when the override is off", async () => {
    pasteState.files = [attachment("a1")];
    renderComposer({}, true, "yes", "off");

    paste(screen.getByLabelText("Ask anything"));

    expect(screen.queryByTestId("pasted-image")).toBeNull();
  });

  it("shows a non-blocking warning when detection says no", () => {
    renderComposer({}, true, "no");
    expect(screen.getByRole("status").textContent).toContain("may not accept images");
    expect(screen.getByLabelText("Ask anything")).toBeTruthy();
  });

  it("shows a warning when the override is off", () => {
    renderComposer({}, true, "yes", "off");
    expect(screen.getByRole("status").textContent).toContain("turned off");
  });

  it("shows no warning when detection says yes", () => {
    renderComposer({}, true, "yes");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clears pending attachments when the session epoch changes", async () => {
    pasteState.files = [attachment("a1")];
    const view = renderPinned({ chat: { ...baseChat, sessionEpoch: 0 } });
    paste(screen.getByLabelText("Ask anything"));
    await screen.findByTestId("pasted-image");

    view.rerender(
      <Composer
        {...view.props}
        chat={{ ...baseChat, sessionEpoch: 1 }}
      />,
    );

    expect(screen.queryByTestId("pasted-image")).toBeNull();
  });

  it("does not swallow a paste of an unsupported image type", () => {
    renderComposer();
    const area = screen.getByLabelText("Ask anything");
    const pasteEvent = createEvent.paste(area, {
      clipboardData: {
        items: [item(new File(["x"], "a.bmp", { type: "image/bmp" }), "image/bmp")],
      },
    });
    fireEvent(area, pasteEvent);
    expect(pasteEvent.defaultPrevented).toBe(false);
  });

  it("does not swallow a mixed paste when image input is off", () => {
    renderComposer({}, true, "yes", "off");
    const area = screen.getByLabelText("Ask anything");
    const pasteEvent = createEvent.paste(area, {
      clipboardData: {
        items: [item(new File(["x"], "a.png", { type: "image/png" }), "image/png")],
      },
    });
    fireEvent(area, pasteEvent);
    expect(pasteEvent.defaultPrevented).toBe(false);
  });
});