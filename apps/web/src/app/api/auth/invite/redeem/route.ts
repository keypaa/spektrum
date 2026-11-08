import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { redeemInvite, RedeemError } from "@/auth/invites";
import { loadWebEnv } from "@spektrum/shared/env";
import { consume, BUDGETS } from "@spektrum/shared/rate-limit";
import { errorResponse } from "@/auth/route-errors";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(12),
  name: z.string().min(1),
});

// POST /api/auth/invite/redeem — consume an invite and create the account.
// Rate-limited per source IP (it sits under /api/auth/*, so Better Auth's own
// limiter does not cover this custom route) and never leaks raw error text:
// only RedeemError messages (our own, user-facing) reach the client.
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req, loadWebEnv().authUrl);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limited = await consume(`invite-redeem:${ip}`, BUDGETS.inviteRedeem);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "too_many_requests", message: "Too many attempts. Try again later." },
        {
          status: 429,
          headers: {
            "retry-after": String(Math.max(1, Math.ceil(limited.retryAfterMs / 1000))),
          },
        },
      );
    }
    const body = schema.parse(await req.json());
    try {
      const { userId } = await redeemInvite(body);
      return NextResponse.json({ ok: true, userId });
    } catch (e) {
      if (e instanceof RedeemError) {
        return NextResponse.json({ error: "bad_request", message: e.message }, { status: 400 });
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
