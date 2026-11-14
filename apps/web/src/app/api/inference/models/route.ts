import { NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { BUDGETS, consume } from "@spektrum/shared/rate-limit";
import { listModels } from "@/lib/ai/models";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const limit = await consume("models:" + user.id, BUDGETS.ai);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))),
          },
        },
      );
    }
    return NextResponse.json({ models: await listModels(user.id, user.role) });
  } catch (error) {
    return errorResponse(error);
  }
}