"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  chatEventSchema,
  type ChatEvent,
  type ChatImageAttachment,
  type MessagePart,
  type ThinkingLevel,
  type ToolName,
} from "@spektrum/shared/ai";
import { isUserTextPart, USER_TEXT_PREFIX } from "./chat-parts";

/**
 * Live thumbnails must survive the send until the persisted image parts (whose
 * ids are server-generated) arrive on the next thread load, so build a local
 * object URL from the attachment's base64 bytes.
 */
function objectUrlFor(
  image: ChatImageAttachment,
  register: (url: string) => void,
): string {
  const binary = atob(image.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: image.mimeType });
  const url =
    typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(blob)
      : `data:${image.mimeType};base64,${image.data}`;
  register(url);
  return url;
}

/**
 * Append one streamed delta. Consecutive deltas of the same kind belong to a
 * single part — the old mutable `streaming` reference could split a reasoning
 * stream into several "Thinking" blocks after React batched an update.
 */
export function appendStreamDelta(
  parts: MessagePart[],
  type: "thinking" | "text",
  delta: string,
): MessagePart[] {
  const last = parts.at(-1);
  if (last?.type === type) {
    // Assistant text and the user's just-sent message are both plain text
    // parts. Never fold the reply into the user bubble, even when the model
    // emits text without a preceding thinking block.
    if (type === "text" && isUserTextPart(last)) {
      return [...parts, { type, text: delta }];
    }
    const next = [...parts];
    next[next.length - 1] = { ...last, text: last.text + delta };
    return next;
  }
  return [...parts, { type, text: delta }];
}

/**
 * Rebuild transcript parts from a stored thread. The store keeps the role on
 * the message row, not on each part, so user text needs the marker the
 * transcript uses to align it right.
 */
export function partsFromThreadMessages(
  messages: Array<{ role: string; content: unknown }>,
): MessagePart[] {
  return messages.flatMap((message) => {
    const parts =
      ((message.content as { parts?: MessagePart[] }).parts ?? []);
    if (message.role !== "user") return parts;
    return parts.map((part) =>
      part.type === "text"
        ? { ...part, text: `${USER_TEXT_PREFIX}${part.text}` }
        : part,
    );
  });
}

export interface LineSelection {
  path: string;
  startLine: number;
  endLine: number;
}

export interface ChatController {
  projectId: string;
  threadId: string | null;
  parts: MessagePart[];
  status: "idle" | "streaming" | "error";
  error: string | null;
  /** True after the gateway rejected an image: show "Retry without images". */
  imageRejected: boolean;
  /** Bumped on reset/loadThread so the composer clears its attachments. */
  sessionEpoch?: number;
  send(
    text: string,
    thinking: ThinkingLevel,
    pinnedPaths: string[],
    displayText?: string,
    selection?: LineSelection,
    images?: ChatImageAttachment[],
    options?: { retryWithoutImages?: boolean; retryOfMessageId?: string },
  ): void;
  loadThread(threadId: string): Promise<void>;
  reset(): void;
  setDiffStatus(diffId: string, status: "accepted" | "rejected"): void;
  stop(): void;
  retry(): void;
  rerun(part: MessagePart): void;
}

export function useChat(input: {
  projectId: string;
  onDiff?: (part: Extract<MessagePart, { type: "diff" }>) => void;
  onTitle?: (threadId: string, title: string) => void;
  onThreadChange?: (threadId: string | null) => void;
  disabled?: boolean;
}): ChatController {
  const params = useSearchParams();
  const cb = useRef(input);
  cb.current = input;
  const [threadId, setThreadId] = useState<string | null>(null);
  const [parts, setParts] = useState<MessagePart[]>([]);
  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  // Object URLs for optimistic thumbnails live until the transcript that uses
  // them is replaced (reset / loadThread / unmount), not after each send.
  const objectUrls = useRef<Set<string>>(new Set());
  const revokeObjectUrls = useCallback(() => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
  }, []);
  // Once the gateway rejects an image in a thread, every later turn must omit
  // history images — otherwise the rejected image is re-sent forever. Unlike
  // the UI flag below this is deliberately NOT cleared at the start of a send.
  const omitHistoryImages = useRef(false);
  // Drives the visible "Retry without images" affordance in the composer.
  const [imageRejected, setImageRejected] = useState(false);
  // Bumped on reset/loadThread so the composer drops its local attachments.
  const [sessionEpoch, setSessionEpoch] = useState(0);
  // Id of the last persisted user turn (from `meta`), reused on retry so the
  // route does not append a duplicate user row.
  const lastUserMessageId = useRef<string | null>(null);
  // An unmounted chat must not keep applying SSE events to a dead page.
  useEffect(
    () => () => {
      controller.current?.abort();
      revokeObjectUrls();
    },
    [revokeObjectUrls],
  );
  const lastSend = useRef<{
    text: string;
    thinking: ThinkingLevel;
    pinnedPaths: string[];
    displayText?: string | undefined;
    selection?: LineSelection | undefined;
    images?: ChatImageAttachment[] | undefined;
  } | null>(null);

  const loadThread = useCallback(
    async (id: string) => {
      const response = await fetch(
        `/api/projects/${cb.current.projectId}/threads/${id}`,
      );
      if (!response.ok) return;
      const body = (await response.json()) as {
        thread: { id: string };
        messages: Array<{ role: string; content: unknown }>;
      };
      const loaded = partsFromThreadMessages(body.messages);
      // The loaded parts use persisted blob keys; the optimistic object URLs
      // from this session are no longer referenced by the transcript.
      revokeObjectUrls();
      omitHistoryImages.current = false;
      setImageRejected(false);
      setSessionEpoch((value) => value + 1);
      lastUserMessageId.current = null;
      setParts(loaded);
      setThreadId(id);
      cb.current.onThreadChange?.(id);
    },
    [revokeObjectUrls],
  );

  const send = useCallback(
    (
      text: string,
      thinking: ThinkingLevel,
      pinnedPaths: string[],
      displayText?: string,
      selection?: LineSelection,
      images?: ChatImageAttachment[],
      options?: { retryWithoutImages?: boolean; retryOfMessageId?: string },
    ) => {
      if (cb.current.disabled) return;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const retryWithoutImages = options?.retryWithoutImages === true;
      const retryOfMessageId = options?.retryOfMessageId;
      // A retry keeps the original send record: images are already persisted
      // and the route trims them from history when retryWithoutImages is set.
      if (!retryWithoutImages) {
        lastSend.current = { text, thinking, pinnedPaths, displayText, selection, images };
      }
      // The button is tied to the last failed turn; a new send hides it. The
      // persistent omit flag stays set for every later turn in this thread.
      setImageRejected(false);
      setStatus("streaming");
      setError(null);
      const shown = displayText ?? text;
      // Pinned files are context, not prose. Record them as @mentions in the
      // displayed message so the transcript can render them as chips.
      const mentions = pinnedPaths
        .map((path) => `@${path}`)
        .filter((mention) => !shown.includes(mention));
      const display = mentions.length ? `${shown} ${mentions.join(" ")}` : shown;
      if (!retryWithoutImages) {
        // Live ids are local: the persisted image parts get server-generated ids.
        const imageParts: MessagePart[] = (images ?? []).map((image, index) => ({
          type: "image",
          id: `local-${image.id}`,
          blobKey: objectUrlFor(image, (url) => objectUrls.current.add(url)),
          name: `Image ${index + 1}`,
          mimeType: image.mimeType,
        }));
        setParts((current) => [
          ...current,
          {
            type: "text",
            text: display.startsWith(USER_TEXT_PREFIX)
              ? display
              : `${USER_TEXT_PREFIX}${display}`,
          },
          ...imageParts,
        ]);
      }

      void (async () => {
        try {
          const response = await fetch(
            `/api/projects/${cb.current.projectId}/chat`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                ...(threadId ? { threadId } : {}),
                message: text,
                thinking,
                pinnedPaths,
                ...(selection ? { selection } : {}),
                ...(images && images.length > 0 ? { images } : {}),
                ...(omitHistoryImages.current ? { omitHistoryImages: true } : {}),
                ...(retryWithoutImages ? { retryWithoutImages: true } : {}),
                ...(retryOfMessageId ? { retryOfMessageId } : {}),
              }),
              signal: abort.signal,
            },
          );
          if (!response.ok || !response.body) {
            const body = (await response.json().catch(() => ({}))) as {
              message?: string;
            };
            setError(body.message ?? "The model request failed");
            setStatus("error");
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let newThreadId: string | null = null;

          const apply = (event: ChatEvent): void => {
            if (event.event === "meta") {
              // Remember the persisted turn so a retry can reuse its row.
              lastUserMessageId.current = event.data.userMessageId;
              // Navigate only once the stream is finished. Doing it here made
              // the URL change reload the thread mid-stream, which could
              // re-append the reply and show it twice.
              setThreadId(event.data.threadId);
              newThreadId = event.data.threadId;
            } else if (event.event === "thinking") {
              setParts((current) =>
                appendStreamDelta(current, "thinking", event.data.delta),
              );
            } else if (event.event === "text") {
              setParts((current) =>
                appendStreamDelta(current, "text", event.data.delta),
              );
            } else if (event.event === "tool_call") {
              setParts((current): MessagePart[] => [
                ...current,
                {
                  type: "tool_call",
                  id: event.data.id,
                  name: event.data.name as ToolName,
                  args: event.data.args,
                },
              ]);
            } else if (event.event === "tool_result") {
              setParts((current): MessagePart[] => [
                ...current,
                {
                  type: "tool_result",
                  id: event.data.id,
                  ok: event.data.ok,
                  summary: event.data.summary,
                },
              ]);
            } else if (event.event === "diff") {
              const part: MessagePart = {
                type: "diff",
                id: event.data.id,
                messageId: event.data.messageId,
                proposal: event.data,
                status: "pending",
              };
              setParts((current) => [...current, part]);
              cb.current.onDiff?.(part);
            } else if (event.event === "title") {
              cb.current.onTitle?.(event.data.threadId, event.data.title);
            } else if (event.event === "done") {
              setStatus("idle");
              if (newThreadId) cb.current.onThreadChange?.(newThreadId);
              newThreadId = null;
            } else if (event.event === "error") {
              // The structured flag is authoritative; the suffix keeps older
              // gateways/clients working. Once set, this thread omits history
              // images on every later turn, not just the immediate retry.
              const rejected =
                event.data.retryWithoutImages === true ||
                event.data.message.includes("Retry without images");
              if (rejected) {
                omitHistoryImages.current = true;
                setImageRejected(true);
              }
              setError(event.data.message);
              setStatus("error");
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
              const eventLine = frame
                .split("\n")
                .find((line) => line.startsWith("event:"));
              const dataLine = frame
                .split("\n")
                .find((line) => line.startsWith("data:"));
              if (!eventLine || !dataLine) continue;
              try {
                apply(
                  chatEventSchema.parse({
                    event: eventLine.slice(6).trim(),
                    data: JSON.parse(dataLine.slice(5).trim()),
                  }),
                );
              } catch {
                // skip a malformed frame, keep the partial text
              }
            }
          }
          setStatus("idle");
        } catch (error) {
          if (abort.signal.aborted) {
            setStatus("idle");
            return;
          }
          setError(error instanceof Error ? error.message : "request failed");
          setStatus("error");
        } finally {
          if (controller.current === abort) controller.current = null;
        }
      })();
    },
    [threadId],
  );

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    lastSend.current = null;
    omitHistoryImages.current = false;
    setImageRejected(false);
    setSessionEpoch((value) => value + 1);
    lastUserMessageId.current = null;
    revokeObjectUrls();
    setThreadId(null);
    setParts([]);
    setStatus("idle");
    setError(null);
    cb.current.onThreadChange?.(null);
  }, [revokeObjectUrls]);

  const setDiffStatus = useCallback(
    (diffId: string, status: "accepted" | "rejected") => {
      setParts((current) =>
        current.map((part) =>
          part.type === "diff" && part.id === diffId ? { ...part, status } : part,
        ),
      );
    },
    [],
  );

  const retry = useCallback(() => {
    if (lastSend.current) {
      // After an image rejection the failed user turn is already persisted.
      // Reuse its row (no duplicate bubble) and drop the images. A normal retry
      // after a transient error keeps the images as before.
      const withoutImages = omitHistoryImages.current;
      send(
        lastSend.current.text,
        lastSend.current.thinking,
        lastSend.current.pinnedPaths,
        lastSend.current.displayText,
        lastSend.current.selection,
        withoutImages ? [] : lastSend.current.images,
        {
          ...(withoutImages ? { retryWithoutImages: true } : {}),
          ...(lastUserMessageId.current
            ? { retryOfMessageId: lastUserMessageId.current }
            : {}),
        },
      );
    }
  }, [send]);

  const rerun = useCallback(
    (_part: MessagePart) => {
      if (lastSend.current) {
        send(
          lastSend.current.text,
          lastSend.current.thinking,
          lastSend.current.pinnedPaths,
          lastSend.current.displayText,
          undefined,
          lastSend.current.images,
        );
      }
    },
    [send],
  );

  const threadParam = params.get("thread");
  useEffect(() => {
    if (threadParam) void loadThread(threadParam);
  }, [threadParam, loadThread]);

  return {
    projectId: cb.current.projectId,
    threadId,
    parts,
    status,
    error,
    imageRejected,
    sessionEpoch,
    send,
    loadThread,
    reset,
    setDiffStatus,
    stop,
    retry,
    rerun,
  };
}