// Session helpers — spec §10.3 ban ladder.
// `assertBanState` is a PURE function (unit-tested in session.test.ts).
// `requireUser` / `requireAdmin` read the Better Auth session and enforce the
// ban state on every request, because cookieCache is disabled (Task 7) so a
// ban is visible on the next request, not after cache expiry.
import { headers } from "next/headers";
import { auth } from "./auth";
import { assertBanState } from "./ban-state";

export { assertBanState } from "./ban-state";
export type { BanState } from "./ban-state";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  retryAfterMs: number | undefined;
  constructor(reason: string, retryAfterMs?: number | undefined) {
    super(reason);
    this.name = "ForbiddenError";
    this.retryAfterMs = retryAfterMs;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  role: string;
}

export async function requireUser(): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new UnauthorizedError();
  const state = assertBanState(
    {
      banned: session.user.banned ?? false,
      banExpires: session.user.banExpires ?? null,
    },
    new Date(),
  );
  if (!state.ok) {
    await auth.api.revokeUserSessions({
      body: { userId: session.user.id },
    });
    throw new ForbiddenError(state.reason, state.retryAfterMs);
  }
  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role ?? "member",
  };
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "owner" && u.role !== "admin") {
    throw new ForbiddenError("admin");
  }
  return u;
}
