"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  chatEventSchema,
  type ChatEvent,
  type MessagePart,
  type ThinkingLevel,
  type ToolName,
} from "@spektrum/shared/ai";
import { isUserTextPart, USER_TEXT_PREFIX } from "./chat-parts";

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
  threadId: string | null;
  parts: MessagePart[];
  status: "idle" | "streaming" | "error";
  error: string | null;
  send(
    text: string,
    thinking: ThinkingLevel,
    pinnedPaths: string[],
    displayText?: string,
    selection?: LineSelection,
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
  // An unmounted chat must not keep applying SSE events to a dead page.
  useEffect(() => () => controller.current?.abort(), []);
  const lastSend = useRef<{
    text: string;
    thinking: ThinkingLevel;
    pinnedPaths: string[];
    displayText?: string | undefined;
    selection?: LineSelection | undefined;
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
      setParts(loaded);
      setThreadId(id);
      cb.current.onThreadChange?.(id);
    },
    [],
  );

  const send = useCallback(
    (
      text: string,
      thinking: ThinkingLevel,
      pinnedPaths: string[],
      displayText?: string,
      selection?: LineSelection,
    ) => {
      if (cb.current.disabled) return;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      lastSend.current = { text, thinking, pinnedPaths, displayText, selection };
      setStatus("streaming");
      setError(null);
      const shown = displayText ?? text;
      setParts((current) => [
        ...current,
        {
          type: "text",
          text: shown.startsWith(USER_TEXT_PREFIX)
            ? shown
            : `${USER_TEXT_PREFIX}${shown}`,
        },
      ]);

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
    setThreadId(null);
    setParts([]);
    setStatus("idle");
    setError(null);
    cb.current.onThreadChange?.(null);
  }, []);

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
      send(
        lastSend.current.text,
        lastSend.current.thinking,
        lastSend.current.pinnedPaths,
        lastSend.current.displayText,
        lastSend.current.selection,
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
    threadId,
    parts,
    status,
    error,
    send,
    loadThread,
    reset,
    setDiffStatus,
    stop,
    retry,
    rerun,
  };
}