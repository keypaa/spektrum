import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { redeemInvite } from "@/auth/invites";
import { loadWebEnv } from "@spektrum/shared/env";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(12),
  name: z.string().min(1),
});

export async function POST(req: NextRequest) {
  assertSameOrigin(req, loadWebEnv().authUrl);
  const body = schema.parse(await req.json());
  try {
    const { userId } = await redeemInvite(body);
    return NextResponse.json({ ok: true, userId });
  } catch (e) {
    return NextResponse.json(
      { message: (e as Error).message },
      { status: 400 },
    );
  }
}
