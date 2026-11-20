import { NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { errorResponse } from "@/auth/route-errors";
import { BUDGETS, consume } from "@spektrum/shared/rate-limit";
import { resolveLlmConfigForRequest } from "@/lib/ai/keys";
import { getThread } from "@/lib/ai/chat-store";
import { NoAssistantError, regenerateTitle } from "@/lib/ai/title";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string; threadId: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { threadId } = await ctx.params;
    if (!UUID_RE.test(threadId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const thread = await getThread({ threadId, userId: user.id });
    if (!thread) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!thread.hasAssistantReply) {
      return NextResponse.json(
        { error: "no_assistant_reply" },
        { status: 409 },
      );
    }

    const limit = await consume("title:" + user.id, BUDGETS.ai);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, Math.ceil(limit.retryAfterMs / 1000)),
            ),
          },
        },
      );
    }

    const resolved = await resolveLlmConfigForRequest(user.id, user.role);
    if (!resolved) {
      return NextResponse.json(
        { error: "llm_key_missing", message: "Add your API key in Settings" },
        { status: 403 },
      );
    }

    try {
      const result = await regenerateTitle({
        threadId,
        userId: user.id,
        baseUrl: resolved.baseUrl,
        apiKey: resolved.key,
        model: resolved.fastModel,
        signal: req.signal,
      });
      if (!result) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof NoAssistantError) {
        return NextResponse.json(
          { error: "no_assistant_reply" },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}