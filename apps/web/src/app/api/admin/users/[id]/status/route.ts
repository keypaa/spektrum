import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { banUser, suspendUser, unbanUser, AdminActionError } from "@/auth/admin";
import { errorResponse } from "@/auth/route-errors";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ban"), reason: z.string().min(1) }),
  z.object({
    action: z.literal("suspend"),
    reason: z.string().min(1),
    until: z.coerce.date(),
  }),
  z.object({ action: z.literal("unban") }),
]);

// POST /api/admin/users/[id]/status — ban ladder (spec §10.5).
// 401 unauthenticated, 403 non-admin, 400 for invalid actions, 200 on success.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAdmin();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { id: userId } = await params;
    const body = bodySchema.parse(await req.json());
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;

    try {
      if (body.action === "ban") {
        await banUser({ actorId: actor.id, userId, reason: body.reason, ip });
      } else if (body.action === "suspend") {
        await suspendUser({
          actorId: actor.id,
          userId,
          until: body.until,
          reason: body.reason,
          ip,
        });
      } else {
        await unbanUser({ actorId: actor.id, userId, ip });
      }
    } catch (e) {
      if (e instanceof AdminActionError) {
        return NextResponse.json({ error: "bad_request", message: e.message }, { status: 400 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
