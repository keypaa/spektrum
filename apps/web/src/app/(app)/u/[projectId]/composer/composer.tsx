"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  IconArrowUp,
  IconChevronDown,
  IconClose,
  IconMic,
  IconPaperclip,
  IconPlus,
  IconSparkle,
  IconStop,
} from "@spektrum/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spektrum/ui";
import {
  IMAGE_LIMITS,
  THINKING,
  imageMimeTypeSchema,
  type ChatImageRef,
  type ImageMimeType,
  type ImageSupportPreference,
  type MessagePart,
  type ThinkingLevel,
} from "@spektrum/shared/ai";
import { useOptionalPreferences } from "@/components/preferences-provider";
import { resolveImageCapability } from "@/lib/ai/image-capability";
import type { ImageSupport } from "@/lib/ai/model-capabilities";
import type { DocumentSummary } from "@/lib/documents";
import { uploadBytesToR2 } from "@/lib/upload/client";
import { readPastedImages } from "./image-paste";
import type { useChat } from "./use-chat";
import { Transcript } from "./transcript";

const LINE_HEIGHT = 16;
const MAX_LINES = 5;

const EXT_BY_MIME: Record<ImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** A ref plus its local thumbnail URL; the URL never leaves the browser. */
type UploadedImage = ChatImageRef & { previewUrl?: string };

function newImageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function Composer({
  chat,
  aiEnabled,
  onReview,
  onUploadFiles,
  onReviewDiff,
  documents = [],
  selection = null,
  onClearSelection = () => undefined,
  onNavigateToSelection = () => undefined,
  beforeSend,
  imageSupport,
  imageSupportOverride,
}: {
  chat: ReturnType<typeof useChat>;
  aiEnabled: boolean;
  onReview(): void;
  onUploadFiles(files: File[]): void;
  onReviewDiff(part: Extract<MessagePart, { type: "diff" }>): void;
  documents?: DocumentSummary[];
  selection?: { path: string; startLine: number; endLine: number } | null;
  onClearSelection?(): void;
  onNavigateToSelection?(range: {
    path: string;
    startLine: number;
    endLine: number;
  }): void;
  beforeSend?(): Promise<void>;
  /** Detected capability of the active chat model; fetched when omitted. */
  imageSupport?: ImageSupport | undefined;
  /** Settings override; read from preferences when omitted. */
  imageSupportOverride?: ImageSupportPreference | undefined;
}): React.ReactElement {
  const [value, setValue] = useState("");
  const [pinnedPaths, setPinnedPaths] = useState<string[]>([]);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const previewUrls = useRef<Set<string>>(new Set());
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [level, setLevel] = useState<ThinkingLevel>("Extra high");
  const preferences = useOptionalPreferences();
  const override =
    imageSupportOverride ?? preferences?.preferences.llm.imageSupport ?? "auto";
  const activeModel =
    imageSupport !== undefined || !preferences?.preferences.llm.configured
      ? null
      : preferences.preferences.llm.chatModel;
  const [fetchedSupport, setFetchedSupport] = useState<ImageSupport | undefined>(
    undefined,
  );
  const capability = resolveImageCapability(imageSupport ?? fetchedSupport, override);

  // The same /models payload Settings uses; look up the active chat model and
  // fall back to the first entry (the chat model in the fallback list).
  useEffect(() => {
    if (imageSupport !== undefined || typeof fetch !== "function") return;
    let cancelled = false;
    void fetch("/api/inference/models")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled || !body || !Array.isArray(body.models)) return;
        const models = body.models as Array<{
          id: string;
          imageSupport?: ImageSupport;
        }>;
        const match = activeModel
          ? models.find((model) => model.id === activeModel)
          : undefined;
        // If the active model is missing from the catalog, show uncertainty
        // instead of borrowing the first model's capability.
        setFetchedSupport(
          activeModel ? match?.imageSupport : models[0]?.imageSupport,
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [imageSupport, activeModel]);

  // The bytes go straight from the browser to R2; the chat request only ever
  // carries the returned key. A local object URL keeps the thumbnail alive
  // until the session ends (it is never sent to the server).
  const uploadImage = useCallback(
    async (bytes: Uint8Array, mimeType: ImageMimeType): Promise<UploadedImage> => {
      const ext = EXT_BY_MIME[mimeType];
      const blobKey = await uploadBytesToR2({
        bytes,
        contentType: mimeType,
        kind: "chat-image",
        ext,
        projectId: chat.projectId,
      });
      const previewUrl =
        typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(
              // Copy into a fresh ArrayBuffer: TS 6 no longer accepts an
              // ArrayBufferLike view as a BlobPart.
              new Blob([new Uint8Array(bytes)], { type: mimeType }),
            )
          : undefined;
      if (previewUrl) previewUrls.current.add(previewUrl);
      return {
        id: newImageId(),
        blobKey,
        mimeType,
        name: `image.${ext}`,
        ...(previewUrl ? { previewUrl } : {}),
      };
    },
    [chat.projectId],
  );

  const revokePreviews = useCallback(() => {
    if (typeof URL.revokeObjectURL === "function") {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
    }
    previewUrls.current.clear();
  }, []);

  const removeImage = useCallback(
    (index: number) => {
      const image = images[index];
      if (image?.previewUrl) {
        previewUrls.current.delete(image.previewUrl);
        if (typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(image.previewUrl);
        }
      }
      setImages((current) => current.filter((_entry, i) => i !== index));
    },
    [images],
  );

  useEffect(() => () => revokePreviews(), [revokePreviews]);

  // New chat / loading a thread starts with an empty composer: drop the
  // previous thread's pending attachments (useChat bumps the epoch on both).
  const sessionEpoch = chat.sessionEpoch ?? 0;
  useEffect(() => {
    setImages([]);
    revokePreviews();
  }, [sessionEpoch, revokePreviews]);

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const plusMenuId = useId();
  const streaming = chat.status === "streaming";
  const disabled = !aiEnabled || (!streaming && !value.trim());

  // Derive the query from the value itself. Tracking the caret as state made
  // the picker dependent on how the text was entered (typing, paste, autofill).
  const mentionQuery = /(?:^|\s)@([^\s@]*)$/.exec(value)?.[1] ?? null;
  const mentionMatches =
    mentionQuery === null
      ? []
      : documents
          .filter((doc) => doc.path.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 50);

  const chooseMention = (path: string): void => {
    const at = value.lastIndexOf("@");
    if (at !== -1) setValue(value.slice(0, at));
    setPinnedPaths((current) =>
      current.includes(path) ? current : [...current, path],
    );
    setMentionOpen(false);
    setMentionIndex(0);
    areaRef.current?.focus();
  };

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const capped = Math.min(el.scrollHeight, LINE_HEIGHT * MAX_LINES);
    el.style.height = `${capped}px`;
    el.style.overflowY =
      el.scrollHeight > LINE_HEIGHT * MAX_LINES ? "auto" : "hidden";
  }, [value]);

  // Guard against a double submit (a fast double click or a click retried by
  // the harness) before the streaming state has re-rendered.
  const sending = useRef(false);
  useEffect(() => {
    if (!streaming) sending.current = false;
  }, [streaming]);

  const submit = async (): Promise<void> => {
    const text = value.trim();
    if (!text || streaming || !aiEnabled || sending.current) return;
    sending.current = true;
    // Capture before clearing: parent state updates are asynchronous.
    const captured = selection;
    await beforeSend?.();
    chat.send(
      text,
      level,
      pinnedPaths,
      undefined,
      captured ?? undefined,
      capability.canAttach ? images : [],
    );
    setValue("");
    setPinnedPaths([]);
    setImages([]);
    setMentionOpen(false);
    onClearSelection();
  };

  return (
    <div className="flex h-full min-h-0 flex-col justify-end px-6 pb-4">
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        aria-label="Choose files to upload"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onUploadFiles(files);
          event.target.value = "";
        }}
      />
      {chat.parts.length > 0 ? (
        <div data-testid="transcript-slot" className="-mr-6 min-h-0 flex-1 overflow-hidden">
          <Transcript
            parts={chat.parts}
            onReviewDiff={onReviewDiff}
            streaming={streaming}
            projectId={chat.projectId}
            threadId={chat.threadId}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          <p className="text-[13px] leading-[18px] text-text-editor-secondary">
            Ready when you are!
          </p>
          {aiEnabled ? (
            <button
              type="button"
              onClick={onReview}
              className="flex h-8 items-center gap-1 rounded-3xl bg-bg-tertiary px-3 text-xs text-text-editor-primary"
            >
              <IconSparkle size={16} />
              Review paper
            </button>
          ) : (
            <p className="text-xs text-text-editor-tertiary">
              Add your API key in Settings
            </p>
          )}
        </div>
      )}

      {chat.error ? (
        <div
          role="alert"
          className="mb-2 flex-none rounded-xl border border-[color:var(--border-log)] bg-bg-app px-3 py-2 text-xs text-fg-error"
        >
          <div className="flex items-start justify-between gap-2">
            <span>{chat.error}</span>
            {chat.imageRejected ? (
              <button
                type="button"
                data-testid="retry-without-images"
                onClick={chat.retry}
                className="flex-none rounded-full border border-[color:var(--border-log)] px-2 py-0.5 text-xs text-fg-error hover:bg-bg-tertiary"
              >
                Retry without images
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {capability.notice ? (
        <p
          role="status"
          className="mb-2 flex-none px-1 text-xs text-text-editor-secondary"
        >
          {capability.notice}
        </p>
      ) : null}

      <div
        data-testid="composer"
        className="relative flex min-h-[64px] w-full flex-none flex-col rounded-3xl border border-[color:var(--ai-border)] bg-ai-bg px-4 py-3"
      >
        {images.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <div key={image.id} data-testid="pasted-image" className="relative">
                <img
                  src={image.previewUrl ?? image.blobKey}
                  alt={`Attached image ${index + 1}`}
                  className="h-16 w-16 rounded-lg object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => removeImage(index)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg-tertiary text-text-editor-secondary hover:text-text-editor-primary"
                >
                  <IconClose size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {pinnedPaths.length > 0 || selection ? (
          <div className="mb-2 flex flex-wrap gap-1">
            {pinnedPaths.map((path) => (
              <span
                key={path}
                data-testid="pinned-file-chip"
                className="flex items-center gap-1 rounded-full bg-bg-tertiary px-2 py-1 text-xs text-text-editor-primary"
              >
                {path}
                <button
                  type="button"
                  aria-label={`Remove ${path}`}
                  onClick={() =>
                    setPinnedPaths((current) => current.filter((p) => p !== path))
                  }
                  className="text-text-editor-tertiary hover:text-text-editor-primary"
                >
                  <IconClose size={12} />
                </button>
              </span>
            ))}
            {selection ? (
              <span
                data-testid="selection-chip"
                className="flex items-center gap-1 rounded-full bg-bg-tertiary px-2 py-1 text-xs text-text-editor-primary"
              >
                <button
                  type="button"
                  onClick={() => onNavigateToSelection(selection)}
                  className="hover:underline"
                >
                  {selection.path} {selection.startLine}-{selection.endLine}
                </button>
                <button
                  type="button"
                  aria-label="Remove selection"
                  onClick={onClearSelection}
                  className="text-text-editor-tertiary hover:text-text-editor-primary"
                >
                  <IconClose size={12} />
                </button>
              </span>
            ) : null}
          </div>
        ) : null}

        <textarea
          ref={areaRef}
          aria-label="Ask anything"
          placeholder="Ask anything"
          value={value}
          rows={1}
          onChange={(event) => {
            setValue(event.target.value);
            setMentionOpen(/(?:^|\s)@([^\s@]*)$/.test(event.target.value));
            setMentionIndex(0);
          }}
          onPaste={(event) => {
            const items = Array.from(event.clipboardData.items);
            const hasAllowedImage = items.some(
              (entry) =>
                entry.kind === "file" &&
                imageMimeTypeSchema.safeParse(entry.type).success,
            );
            if (!hasAllowedImage) return; // ordinary text paste / unsupported type
            // Only swallow the event when we actually handle the image. With
            // image input off (or an unsupported type), mixed image+text pastes
            // must still insert their text.
            if (!capability.canAttach) return;
            event.preventDefault();
            void readPastedImages(items, uploadImage).then((added) => {
              if (added.length === 0) return;
              setImages((current) => {
                const room = IMAGE_LIMITS.maxCount - current.length;
                return room > 0 ? [...current, ...added.slice(0, room)] : current;
              });
            });
          }}
          onKeyDown={(event) => {
            if (mentionOpen && mentionMatches.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setMentionIndex((index) => (index + 1) % mentionMatches.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setMentionIndex(
                  (index) => (index - 1 + mentionMatches.length) % mentionMatches.length,
                );
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                chooseMention(mentionMatches[mentionIndex]!.path);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setMentionOpen(false);
                return;
              }
            }
            if (event.key === "Backspace" && value.length === 0) {
              event.preventDefault();
              if (selection) onClearSelection();
              else if (pinnedPaths.length > 0)
                setPinnedPaths((current) => current.slice(0, -1));
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          className="w-full resize-none bg-transparent text-xs leading-4 text-text-editor-primary outline-none placeholder:text-text-editor-placeholder"
        />
        {mentionOpen ? (
          <div
            role="listbox"
            aria-label="Workspace files"
            className="absolute bottom-16 left-6 z-20 max-h-40 w-72 overflow-y-auto rounded-xl border border-[color:var(--border-outline)] bg-bg-app p-1 shadow-menu"
          >
            {mentionMatches.length === 0 ? (
              <p className="px-2 py-2 text-xs text-text-editor-tertiary">
                No files match your search.
              </p>
            ) : null}
            {mentionMatches.map((doc, index) => (
              <button
                key={doc.id}
                type="button"
                role="option"
                aria-selected={index === mentionIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseMention(doc.path);
                }}
                className={`block w-full truncate rounded-lg px-2 py-1 text-left text-xs ${
                  index === mentionIndex
                    ? "bg-nav-bg-hover text-text-editor-primary"
                    : "text-text-editor-secondary"
                }`}
              >
                {doc.path}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Add files"
                aria-haspopup="menu"
                aria-controls={plusMenuId}
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-text-editor-secondary hover:text-text-editor-primary"
              >
                <IconPlus size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              id={plusMenuId}
              side="top"
              align="start"
              className="min-w-[220px]"
            >
              <DropdownMenuItem
                onSelect={() => uploadInputRef.current?.click()}
                className="flex-col items-start gap-0.5"
              >
                <span className="flex items-center gap-2">
                  <IconPaperclip size={16} />
                  Upload files &amp; photos
                </span>
                <span className="text-xs text-text-editor-tertiary">
                  Add files to this project&apos;s workspace
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Thinking: ${level}`}
                className="flex h-7 items-center gap-1 rounded-full px-2 text-xs text-text-editor-secondary hover:text-text-editor-primary"
              >
                <span>{`Thinking: ${level}`}</span>
                <IconChevronDown size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="min-w-[160px]">
              {(Object.keys(THINKING) as ThinkingLevel[]).map((entry) => (
                <DropdownMenuItem key={entry} onSelect={() => setLevel(entry)}>
                  {entry}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            aria-label="Voice mode"
            aria-disabled="true"
            className="flex h-7 w-7 flex-none cursor-not-allowed items-center justify-center rounded-full text-text-editor-secondary opacity-50"
          >
            <IconMic size={16} />
          </button>

          <button
            type="button"
            aria-label={streaming ? "Stop" : "Send"}
            aria-disabled={disabled}
            onClick={streaming ? chat.stop : submit}
            className="ml-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[color:var(--button-primary-bg)] text-[color:var(--button-primary-text)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
          >
            {streaming ? <IconStop size={16} /> : <IconArrowUp size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}