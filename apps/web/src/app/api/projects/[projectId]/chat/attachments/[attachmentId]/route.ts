import { NextRequest, NextResponse } from "next/server";
import { StorageError } from "@spektrum/storage";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { findImagePart, getThread } from "@/lib/ai/chat-store";
import { readChatImage } from "@/lib/ai/image-attachments";

// GET /api/projects/:projectId/chat/attachments/:attachmentId?threadId=...
// Owner-only thumbnail for a pasted image. Every miss is a 404 so a non-owner
// cannot distinguish an unknown attachment from a real one, let alone get bytes.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; attachmentId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId, attachmentId } = await ctx.params;
    const threadId = new URL(req.url).searchParams.get("threadId");
    if (!threadId || !UUID_RE.test(projectId)) return notFound();

    const thread = await getThread({ threadId, userId: user.id });
    if (!thread || thread.projectId !== projectId) return notFound();

    const part = await findImagePart(threadId, attachmentId);
    if (!part) return notFound();

    const bytes = await readChatImage(part.blobKey);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": part.mimeType,
        "cache-control": "private",
        // An attachment is never rendered as a document: stop type sniffing.
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof StorageError) return notFound();
    return errorResponse(e);
  }
}
