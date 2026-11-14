import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { errorResponse } from "@/auth/route-errors";
import { updateDiffDecision } from "@/lib/ai/chat-store";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({
  diffId: z.string().min(1),
  decision: z.enum(["accepted", "rejected"]),
});

export async function PATCH(
  req: Request,
  ctx: {
    params: Promise<{
      projectId: string;
      threadId: string;
      messageId: string;
    }>;
  },
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { threadId, messageId } = await ctx.params;
    if (!UUID_RE.test(threadId) || !UUID_RE.test(messageId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const body = bodySchema.parse(await req.json());
    const ok = await updateDiffDecision({
      threadId,
      userId: user.id,
      messageId,
      diffId: body.diffId,
      decision: body.decision,
    });
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}