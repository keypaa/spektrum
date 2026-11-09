import { auth } from "@/auth/auth";
import { clearOutstandingResetTokens } from "@/auth/password-reset";

// Better Auth owns POST /api/auth/change-password. This more specific route
// shadows the catch-all so a successful password change also invalidates
// outstanding reset tokens (spec §10.2). The database hook cannot do this:
// Better Auth writes the password through `updateMany`, whose hook payload is
// the affected row count, not the account.
//
// Request handling is unchanged — auth.handler still runs Better Auth's
// origin check, rate limiting, session middleware and cookie handling.
export async function POST(req: Request): Promise<Response> {
  const res = await auth.handler(req);

  if (res.ok) {
    // a successful change returns { token, user }
    const body = (await res.clone().json().catch(() => null)) as {
      user?: { id?: string };
    } | null;
    if (body?.user?.id) {
      await clearOutstandingResetTokens(body.user.id);
    }
  }

  return res;
}
