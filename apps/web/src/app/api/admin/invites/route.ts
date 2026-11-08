import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { createInvite, listInvites, revokeInvite } from "@/auth/invites";
import { loadWebEnv } from "@spektrum/shared/env";
import { errorResponse } from "@/auth/route-errors";

const createSchema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdmin();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const body = createSchema.parse(await req.json());
    const { token } = await createInvite({ email: body.email, actorId: actor.id });
    return NextResponse.json({
      token,
      url: `${loadWebEnv().authUrl}/invite/${token}`,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    assertSameOrigin(req, loadWebEnv().authUrl);
    return NextResponse.json({ invites: await listInvites() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { id } = z.object({ id: z.string().uuid() }).parse(await req.json());
    await revokeInvite(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
