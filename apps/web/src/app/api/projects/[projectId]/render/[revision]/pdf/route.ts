import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { getRender } from "@/lib/render-store";
import { getObject, getObjectRange } from "@spektrum/storage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVISION_RE = /^[0-9a-f]{64}$/;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; revision: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId, revision } = await ctx.params;
    if (!UUID_RE.test(projectId) || !REVISION_RE.test(revision)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const found = await getRender(user.id, projectId, revision);
    if (!found) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const range = req.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d+)$/.exec(range);
      if (!match) {
        return new Response(null, { status: 416 });
      }
      const start = Number(match[1]);
      const end = Number(match[2]);
      const { body, size } = await getObjectRange(
        "pdf",
        found.pdfKey,
        start,
        end,
      );
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Type": "application/pdf",
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
        },
      });
    }

    const object = await getObject("pdf", found.pdfKey);
    return new Response(new Uint8Array(object.body), {
      headers: {
        "Content-Type": "application/pdf",
        "Accept-Ranges": "bytes",
        "Content-Length": String(object.size),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}