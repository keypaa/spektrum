// Session revocation — must go through Better Auth's internal adapter.
//
// Why not `db.delete(sessions)` directly: when `secondaryStorage` (Redis) is
// configured, Better Auth caches every session there. Deleting only the DB row
// leaves the cached session (and its cached `user` snapshot) alive, so
// `getSession()` keeps returning the stale, unbanned user. The internal adapter
// deletes the DB rows *and* the secondary-storage keys, which is what makes a
// pre-ban cookie die on the very next request.
import { auth } from "./auth";

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(userId);
}
