import { auth } from "@/auth/auth";
import {
  clearOutstandingResetTokens,
  findResetTokenUserId,
} from "@/auth/password-reset";

// Better Auth owns POST /api/auth/reset-password. This more specific route
// shadows the catch-all so that a successful reset invalidates any *other*
// outstanding reset tokens for the same user (spec §10.2: invalidated on use
// and on password change). Better Auth itself already consumes the token being
// used; this adds the sibling invalidation.
//
// The user id must be resolved before forwarding: the handler deletes the
// verification row as part of consumption.
export async function POST(req: Request): Promise<Response> {
  const token = await readToken(req);
  const userId = token ? await findResetTokenUserId(token) : null;

  const res = await auth.handler(req);

  if (res.ok && userId) {
    await clearOutstandingResetTokens(userId);
  }

  return res;
}

async function readToken(req: Request): Promise<string | null> {
  const fromQuery = new URL(req.url).searchParams.get("token");
  if (fromQuery) return fromQuery;
  const body = (await req
    .clone()
    .json()
    .catch(() => null)) as { token?: unknown } | null;
  return typeof body?.token === "string" ? body.token : null;
}
