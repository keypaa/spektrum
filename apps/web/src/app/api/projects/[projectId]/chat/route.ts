import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { chatThreads } from "@spektrum/db/schema";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { BUDGETS, consume } from "@spektrum/shared/rate-limit";
import { redactSecrets } from "@spektrum/shared/log/redact";
import {
  SYSTEM_PROMPT,
  type MessagePart,
  type ThinkingLevel,
  type ToolName,
} from "@spektrum/shared/ai";
import { errorResponse } from "@/auth/route-errors";
import { getProject } from "@/lib/projects";
import { listTree } from "@/lib/documents";
import {
  appendMessage,
  createThread,
  getThread,
  recentTurns,
  touchedPaths,
} from "@/lib/ai/chat-store";
import { buildContext } from "@/lib/ai/context";
import { GatewayHttpError, streamGateway } from "@/lib/ai/gateway";
import { executeTool } from "@/lib/ai/tools";
import { resolveLlmKeyForRequest } from "@/lib/ai/keys";
import { recordUsage } from "@/lib/ai/usage";
import { generateTitle } from "@/lib/ai/title";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THINKING = ["Minimal", "Low", "Medium", "High", "Extra high"] as const;
const bodySchema = z.object({
  threadId: z.string().uuid().optional(),
  message: z.string().min(1),
  thinking: z.enum(THINKING).default("Medium"),
  pinnedPaths: z.array(z.string()).optional(),
  selection: z
    .object({ path: z.string(), startLine: z.number().int(), endLine: z.number().int() })
    .optional(),
});

function fallbackTitle(message: string): string {
  return Array.from(message).slice(0, 60).join("");
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { projectId } = await ctx.params;
    if (!UUID_RE.test(projectId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const project = await getProject(user.id, projectId);
    if (!project) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const body = bodySchema.parse(await req.json());

    const limit = await consume("ai:" + user.id, BUDGETS.ai);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))),
          },
        },
      );
    }

    const resolved = await resolveLlmKeyForRequest(user.id, user.role);
    if (!resolved) {
      return NextResponse.json(
        { error: "llm_key_missing", message: "Add your API key in Settings" },
        { status: 403 },
      );
    }

    let thread = body.threadId
      ? await getThread({ threadId: body.threadId, userId: user.id })
      : null;
    if (body.threadId && !thread) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!thread) {
      const created = await createThread({
        projectId,
        userId: user.id,
        title: fallbackTitle(body.message),
      });
      const createdThread = await getThread({
        threadId: created.id,
        userId: user.id,
      });
      if (!createdThread) {
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
      thread = createdThread;
    }

    const tree = await listTree(user.id, projectId);
    const main =
      tree.find((doc) => doc.id === project.mainDocumentId) ??
      tree.find((doc) => doc.kind === "tex");
    const mainFile = main?.path ?? "main.tex";

    const history = await recentTurns(thread.id);
    const env = loadWebEnv();
    const model = env.llmModelChat;
    const thinking = body.thinking as ThinkingLevel;

    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown): void => {
          if (closed) return;
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };
        const finish = (): void => {
          if (closed) return;
          closed = true;
          controller.close();
        };
        const heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
        }, 10_000);

        try {
          const userMessage = await appendMessage({
            threadId: thread.id,
            role: "user",
            content: { parts: [{ type: "text", text: body.message }] },
          });
          send("meta", {
            threadId: thread.id,
            userMessageId: userMessage.id,
            model,
          });

          const threadPaths = await touchedPaths(thread.id);
          const requestTouched = new Set<string>();
          let context = await buildContext({
            userId: user.id,
            projectId,
            mainFile,
            pinnedPaths: body.pinnedPaths ?? [],
            ...(body.selection ? { selection: body.selection } : {}),
            touchedPaths: Array.from(
              new Set([...threadPaths, ...requestTouched]),
            ),
            history,
          });
          const messages: Array<{
            role: "system" | "user" | "assistant" | "tool";
            content: string;
            tool_calls?: unknown[];
            tool_call_id?: string;
          }> = [
            {
              role: "system",
              content: SYSTEM_PROMPT + "\n\n" + context.text,
            },
            { role: "user", content: body.message },
          ];

          let inputTokens = 0;
          let outputTokens = 0;
          let assistantText = "";
          let done = false;

          for (let step = 0; step < 8 && !done; step += 1) {
            if (step > 0) {
              context = await buildContext({
                userId: user.id,
                projectId,
                mainFile,
                pinnedPaths: body.pinnedPaths ?? [],
                ...(body.selection ? { selection: body.selection } : {}),
                touchedPaths: Array.from(
                  new Set([...threadPaths, ...requestTouched]),
                ),
                history,
              });
              messages[0] = {
                role: "system",
                content: SYSTEM_PROMPT + "\n\n" + context.text,
              };
            }

            const stepAssistantId = crypto.randomUUID();
            const thinkingParts: MessagePart[] = [];
            const textParts: MessagePart[] = [];
            const calls = new Map<
              number,
              { id: string; name: string; args: string }
            >();

            for await (const event of streamGateway({
              baseUrl: env.llmBaseUrl,
              apiKey: resolved.key,
              model,
              thinking,
              messages,
              ...(req.signal ? { signal: req.signal } : {}),
            })) {
              if (event.type === "thinking") {
                thinkingParts.push({ type: "thinking", text: event.delta });
                send("thinking", { delta: event.delta });
              } else if (event.type === "text") {
                textParts.push({ type: "text", text: event.delta });
                assistantText += event.delta;
                send("text", { delta: event.delta });
              } else if (event.type === "tool_call_start") {
                calls.set(event.index, {
                  id: event.id,
                  name: event.name,
                  args: "",
                });
              } else if (event.type === "tool_call_delta") {
                const call = calls.get(event.index);
                if (call) call.args += event.argsDelta;
              } else if (event.type === "usage") {
                inputTokens += event.inputTokens;
                outputTokens += event.outputTokens;
              }
            }

            const toolCalls = [...calls.values()];
            if (toolCalls.length === 0) {
              await appendMessage({
                threadId: thread.id,
                role: "assistant",
                content: { parts: [...thinkingParts, ...textParts] },
                id: stepAssistantId,
              });
              send("done", {
                usage: { in: inputTokens, out: outputTokens },
              });
              done = true;
              await recordUsage({
                userId: user.id,
                model,
                inputTokens,
                outputTokens,
                requestId: crypto.randomUUID(),
              });
              break;
            }

            let args: Array<{ id: string; name: ToolName; args: unknown }> = [];
            try {
              args = toolCalls.map((call) => ({
                id: call.id,
                name: call.name as ToolName,
                args: JSON.parse(call.args || "{}"),
              }));
            } catch {
              await appendMessage({
                threadId: thread.id,
                role: "assistant",
                content: { parts: [...thinkingParts, ...textParts] },
                id: stepAssistantId,
              });
              send("error", {
                message: "invalid tool arguments",
                retryable: false,
              });
              finish();
              return;
            }

            const toolCallParts: MessagePart[] = args.map((call) => ({
              type: "tool_call",
              id: call.id,
              name: call.name,
              args: call.args,
            }));
            for (const call of args) {
              send("tool_call", {
                id: call.id,
                name: call.name,
                args: call.args,
              });
            }
            await appendMessage({
              threadId: thread.id,
              role: "assistant",
              content: { parts: [...thinkingParts, ...textParts, ...toolCallParts] },
              id: stepAssistantId,
            });

            const toolResultParts: MessagePart[] = [];
            const diffParts: MessagePart[] = [];
            const nativeToolMessages: Array<{
              role: "tool";
              tool_call_id: string;
              content: string;
            }> = [];
            let fatal = false;

            for (const call of args) {
              const result = await executeTool(call.name, call.args, {
                userId: user.id,
                role: user.role,
                projectId,
                mainFile,
                touchedPaths: requestTouched,
              });
              toolResultParts.push({
                type: "tool_result",
                id: call.id,
                ok: result.ok,
                summary: result.summary,
              });
              send("tool_result", {
                id: call.id,
                ok: result.ok,
                summary: result.summary,
              });

              if (!result.ok && result.fatal) {
                fatal = true;
                break;
              }

              if (result.ok && result.proposal) {
                const proposalId = crypto.randomUUID();
                const part: MessagePart = {
                  type: "diff",
                  id: proposalId,
                  messageId: stepAssistantId,
                  proposal: result.proposal,
                  status: "pending",
                };
                diffParts.push(part);
                send("diff", {
                  ...result.proposal,
                  id: proposalId,
                  messageId: stepAssistantId,
                });
              }

              const proposal = result.ok ? result.proposal : undefined;
              const data = result.ok ? result.data : undefined;
              nativeToolMessages.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify(
                  data ?? {
                    ok: true,
                    summary: result.summary,
                    proposal: proposal
                      ? { path: proposal.path, kind: proposal.kind }
                      : undefined,
                  },
                ),
              });
            }

            await appendMessage({
              threadId: thread.id,
              role: "assistant",
              content: {
                parts: [
                  ...thinkingParts,
                  ...textParts,
                  ...toolCallParts,
                  ...toolResultParts,
                  ...diffParts,
                ],
              },
              id: stepAssistantId,
            });

            if (fatal) {
              send("error", {
                message: "the tool call failed",
                retryable: false,
              });
              finish();
              return;
            }

            messages.push({
              role: "assistant",
              content: "",
              tool_calls: args.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              })),
            });
            messages.push(...nativeToolMessages);
          }

          if (!done) {
            send("error", {
              message: "tool step limit",
              retryable: false,
            });
          }

          if (thread.titleSource === "fallback" && assistantText) {
            try {
              const title = await generateTitle({
                firstUserMessage: body.message,
                firstAssistantReply: assistantText,
                baseUrl: env.llmBaseUrl,
                apiKey: resolved.key,
                model: env.llmModelFast,
                signal: AbortSignal.timeout(2000),
              });
              if (title) {
                // Persist before emitting: the client refreshes the thread list
                // on `title`, and must read the generated title, not the fallback.
                await db
                  .update(chatThreads)
                  .set({ title, titleSource: "llm", updatedAt: new Date() })
                  .where(eq(chatThreads.id, thread.id))
                  .catch(() => undefined);
                send("title", {
                  threadId: thread.id,
                  title,
                  titleSource: "llm",
                });
              }
            } catch {
              // fire-and-forget: the fallback title stays
            }
          }
          finish();
        } catch (error) {
          if (error instanceof GatewayHttpError) {
            send("error", {
              message:
                error.status === 401
                  ? "The model rejected the request"
                  : redactSecrets(error.message),
              retryable: error.status === 429 || error.status >= 500,
            });
          } else {
            send("error", {
              message: "The model request failed",
              retryable: true,
            });
          }
          finish();
        } finally {
          clearInterval(heartbeat);
        }
      },
      cancel() {
        closed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}