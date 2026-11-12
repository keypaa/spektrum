import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { errorResponse } from "@/auth/route-errors";
import { getPreferences, putPreferences } from "@/lib/preferences";

// GET /api/user/preferences -> { preferences: Preferences } (spec §9.7/§19.5)
// PUT /api/user/preferences -> upsert the §9.7 object; 400 on an unknown key
//   or an out-of-range value (strict zod at the boundary).
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    return NextResponse.json({ preferences: await getPreferences(user.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const value = await putPreferences(user.id, await req.json());
    return NextResponse.json({ preferences: value });
  } catch (e) {
    return errorResponse(e);
  }
}