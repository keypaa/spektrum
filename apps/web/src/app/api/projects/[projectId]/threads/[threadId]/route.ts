import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { errorResponse } from "@/auth/route-errors";
import {
  deleteThread,
  getThread,
  listMessages,
  renameThread,
} from "@/lib/ai/chat-store";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ title: z.string().min(1).max(200) });

type Ctx = { params: Promise<{ projectId: string; threadId: string }> };

export async function GET(
  _req: Request,
  ctx: Ctx,
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { threadId } = await ctx.params;
    if (!UUID_RE.test(threadId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const thread = await getThread({ threadId, userId: user.id });
    if (!thread) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({
      thread,
      messages: await listMessages({ threadId, userId: user.id }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  req: Request,
  ctx: Ctx,
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { threadId } = await ctx.params;
    if (!UUID_RE.test(threadId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const body = bodySchema.parse(await req.json());
    const thread = await renameThread({
      threadId,
      userId: user.id,
      title: body.title,
    });
    if (!thread) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ thread });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  req: Request,
  ctx: Ctx,
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { threadId } = await ctx.params;
    if (!UUID_RE.test(threadId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!(await deleteThread({ threadId, userId: user.id }))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}