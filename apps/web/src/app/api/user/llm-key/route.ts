import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import {
  saveLlmKey,
  getLlmKeyStatus,
  deleteLlmKey,
  validateApiKeyShape,
} from "@/auth/llm-key";

// /api/user/llm-key — BYOK key management (spec §12.2).
// GET  -> { configured: boolean, last4?: string }   (never the plaintext)
// PUT  -> store/replace the key (body { apiKey })
// DELETE -> remove the key immediately
const putSchema = z.object({ apiKey: z.string() });

export async function GET(req: NextRequest) {
  const user = await requireUser();
  assertSameOrigin(req, loadWebEnv().authUrl);
  return NextResponse.json(await getLlmKeyStatus(user.id));
}

export async function PUT(req: NextRequest) {
  const user = await requireUser();
  assertSameOrigin(req, loadWebEnv().authUrl);
  const body = putSchema.parse(await req.json());
  const check = validateApiKeyShape(body.apiKey);
  if (!check.ok) {
    return NextResponse.json({ message: check.reason }, { status: 400 });
  }
  await saveLlmKey(user.id, body.apiKey);
  // respond with status only — never echo the key back
  return NextResponse.json(await getLlmKeyStatus(user.id));
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  assertSameOrigin(req, loadWebEnv().authUrl);
  await deleteLlmKey(user.id);
  return NextResponse.json({ configured: false });
}
