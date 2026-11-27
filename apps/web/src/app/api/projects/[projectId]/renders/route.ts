// POST /api/projects/:projectId/renders — commit a browser compile result.
// The bytes were uploaded directly to R2; this route only accepts the signed
// keys, validates them against the session, and writes the render row.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { diagnosticSchema, projectStatsSchema } from "@spektrum/shared/compile";
import {
  commitRender,
  CommitRenderError,
  type CommitRenderBody,
} from "@/lib/render-commit";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const commitRenderBodySchema = z.object({
  revision: z.string().regex(/^[0-9a-f]{64}$/),
  mainFile: z.string().min(1).max(200),
  pdfKey: z.string().min(1).max(1024),
  synctexKey: z.string().min(1).max(1024).nullable(),
  log: z.string().max(4_000_000).nullable(),
  diagnostics: z.array(diagnosticSchema).max(500).nullable(),
  stats: projectStatsSchema.nullable(),
  durationMs: z.number().finite().nonnegative().nullable(),
});

const STATUS: Record<CommitRenderError["code"], number> = {
  not_found: 404,
  bad_request: 400,
  too_large: 413,
};

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
    const body: CommitRenderBody = commitRenderBodySchema.parse(await req.json());
    return NextResponse.json(await commitRender(user.id, projectId, body));
  } catch (error) {
    if (error instanceof CommitRenderError) {
      return NextResponse.json(
        { error: error.code },
        { status: STATUS[error.code] },
      );
    }
    return errorResponse(error);
  }
}
