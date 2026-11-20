// GET /api/user/llm-config — the effective provider/model selection.
// Returns no secrets: the API key stays server-side and write-only.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { errorResponse } from "@/auth/route-errors";
import { getPreferences } from "@/lib/preferences";
import { effectiveLlmConfig } from "@/lib/ai/keys";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { llm } = await getPreferences(user.id);
    return NextResponse.json(effectiveLlmConfig(llm));
  } catch (e) {
    return errorResponse(e);
  }
}
