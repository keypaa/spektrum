import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { errorResponse } from "@/auth/route-errors";
import { DocumentPathError } from "@/lib/documents";
import { enqueueProjectCompile } from "@/lib/compile-request";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ mainFile: z.string().min(1).max(200) });

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { projectId } = await ctx.params;
    if (!UUID_RE.test(projectId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const body = bodySchema.parse(await req.json());
    const result = await enqueueProjectCompile(user, projectId, body.mainFile);

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (result.kind === "rate_limited") {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, Math.ceil(result.retryAfterMs / 1000)),
            ),
          },
        },
      );
    }
    if (result.kind === "cached") {
      return NextResponse.json({
        revision: result.revision,
        cached: true,
      });
    }
    return NextResponse.json({ revision: result.revision }, { status: 202 });
  } catch (error) {
    if (error instanceof DocumentPathError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return errorResponse(error);
  }
}
