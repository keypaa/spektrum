// Pure ban-state check — spec §10.3 ban ladder.
// Kept in its own module (no imports) so it can be unit-tested without
// loading the Better Auth instance / database.
export type BanState =
  | { ok: true }
  | { ok: false; reason: "banned" | "suspended"; retryAfterMs?: number };

export function assertBanState(
  user: { banned: boolean; banExpires: Date | null },
  now: Date,
): BanState {
  if (!user.banned) return { ok: true };
  if (user.banExpires === null) {
    // permanent ban
    return { ok: false, reason: "banned" };
  }
  if (user.banExpires.getTime() > now.getTime()) {
    // suspension still active
    return {
      ok: false,
      reason: "suspended",
      retryAfterMs: user.banExpires.getTime() - now.getTime(),
    };
  }
  // ban_expires elapsed — the ladder lifts itself
  return { ok: true };
}
