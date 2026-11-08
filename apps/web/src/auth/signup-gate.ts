// Closed-signup gate — spec §10.2.
// v1 signup is allowed only when:
//   1. ALLOW_PUBLIC_SIGNUP === "true" (flag off in v1), or
//   2. an unconsumed, unexpired, unrevoked invite exists for the email, or
//   3. allowBootstrap is set (owner CLI bootstrap, Task 17).
// The gate is enforced inside Better Auth's databaseHooks.user.create.before
// so it applies to EVERY create path: email/password, Google OAuth (with
// disableImplicitSignUp), and any future provider.
import { APIError } from "better-auth/api";
import { db } from "@spektrum/db";
import { invites } from "@spektrum/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";

export function assertSignupAllowed(input: {
  email: string;
  allowPublicSignup: boolean;
  hasValidInvite: boolean;
  allowBootstrap?: boolean;
}): void {
  if (input.allowBootstrap) return;
  if (input.allowPublicSignup) return;
  if (input.hasValidInvite) return;
  throw new APIError("FORBIDDEN", { message: "invite_required" });
}

export async function hasValidInvite(email: string): Promise<boolean> {
  const normalised = email.trim().toLowerCase();
  const rows = await db
    .select({ id: invites.id })
    .from(invites)
    .where(
      and(
        eq(invites.email, normalised),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
