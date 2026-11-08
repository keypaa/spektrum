// Session helpers — spec §10.3 ban ladder.
// `assertBanState` is a PURE function (unit-tested in session.test.ts).
// `requireUser` / `requireAdmin` read the Better Auth session and enforce the
// ban state on every request, because cookieCache is disabled (Task 7) so a
// ban is visible on the next request, not after cache expiry.
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { users, sessions } from "@spektrum/db/schema";
import { auth } from "./auth";
import { assertBanState } from "./ban-state";
import { revokeAllUserSessions } from "./revoke";

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
  // The session/user pair can be cached in Redis (secondary storage), so the
  // authoritative ban state and role are re-read from Postgres on every
  // request: a ban or role change is visible immediately, never after cache
  // expiry. This is the backstop for a revocation whose cache delete failed.
  const rows = await db
    .select({
      email: users.email,
      role: users.role,
      banned: users.banned,
      banExpires: users.banExpires,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const user = rows[0];
  if (!user) throw new UnauthorizedError(); // session without a user row
  const state = assertBanState(
    { banned: user.banned, banExpires: user.banExpires },
    new Date(),
  );
  if (!state.ok) {
    // Revoke through Better Auth's internal adapter (DB + Redis cache). If the
    // revocation itself fails we still fail closed via the DB check above.
    try {
      await revokeAllUserSessions(session.user.id);
    } catch {
      // logged by the caller's 500 path if it ever happens; the ban state in
      // Postgres still blocks this request
    }
    throw new ForbiddenError(state.reason, state.retryAfterMs);
  }
  return { id: session.user.id, email: user.email, role: user.role };
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "owner" && u.role !== "admin") {
    throw new ForbiddenError("admin");
  }
  return u;
}

// Token-based variant of requireUser (used by tests and by any non-request
// context): looks the session up directly, then applies the same ban check.
export async function requireUserForToken(token: string): Promise<SessionUser> {
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.token, token))
    .limit(1);
  const row = rows[0];
  if (!row || row.session.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError();
  }
  const state = assertBanState(
    { banned: row.user.banned, banExpires: row.user.banExpires },
    new Date(),
  );
  if (!state.ok) {
    throw new ForbiddenError(state.reason, state.retryAfterMs);
  }
  return { id: row.user.id, email: row.user.email, role: row.user.role };
}
