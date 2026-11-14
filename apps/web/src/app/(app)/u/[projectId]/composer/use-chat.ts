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

export interface ChatController {
  threadId: string | null;
  parts: MessagePart[];
  status: "idle" | "streaming" | "error";
  error: string | null;
  send(text: string, thinking: ThinkingLevel, pinnedPaths: string[]): void;
  loadThread(threadId: string): Promise<void>;
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
  const lastSend = useRef<{
    text: string;
    thinking: ThinkingLevel;
    pinnedPaths: string[];
  } | null>(null);

  const loadThread = useCallback(
    async (id: string) => {
      const response = await fetch(
        `/api/projects/${cb.current.projectId}/threads/${id}`,
      );
      if (!response.ok) return;
      const body = (await response.json()) as {
        thread: { id: string };
        messages: Array<{ content: unknown }>;
      };
      const loaded = body.messages.flatMap(
        (message) =>
          ((message.content as { parts?: MessagePart[] }).parts ?? []),
      );
      setParts(loaded);
      setThreadId(id);
      cb.current.onThreadChange?.(id);
    },
    [],
  );

  const send = useCallback(
    (text: string, thinking: ThinkingLevel, pinnedPaths: string[]) => {
      if (cb.current.disabled) return;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      lastSend.current = { text, thinking, pinnedPaths };
      setStatus("streaming");
      setError(null);
      setParts((current) => [
        ...current,
        { type: "text", text: `User: ${text}` },
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
          let streaming: MessagePart | null = null;

          const apply = (event: ChatEvent): void => {
            if (event.event === "meta") {
              setThreadId(event.data.threadId);
              cb.current.onThreadChange?.(event.data.threadId);
            } else if (event.event === "thinking") {
              if (!streaming || streaming.type !== "thinking") {
                streaming = { type: "thinking", text: "" };
                setParts((current): MessagePart[] => [...current, streaming!]);
              }
              streaming.text += event.data.delta;
              setParts((current) => [...current]);
            } else if (event.event === "text") {
              if (!streaming || streaming.type !== "text") {
                streaming = { type: "text", text: "" };
                setParts((current): MessagePart[] => [...current, streaming!]);
              }
              streaming.text += event.data.delta;
              setParts((current) => [...current]);
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
              const dataLine = frame
                .split("\n")
                .find((line) => line.startsWith("data:"));
              if (!dataLine) continue;
              try {
                apply(
                  chatEventSchema.parse(
                    JSON.parse(dataLine.slice(5).trim()),
                  ),
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

  const retry = useCallback(() => {
    if (lastSend.current) {
      send(
        lastSend.current.text,
        lastSend.current.thinking,
        lastSend.current.pinnedPaths,
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
    stop,
    retry,
    rerun,
  };
}