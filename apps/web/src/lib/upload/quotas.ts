// Per-user storage quotas for direct-to-R2 uploads (serverless plan Task 3).
//
// The byte counter is deliberately approximate: a signed PUT is a bearer
// credential and we cannot observe the actual bytes until a later task reads
// the object back with getObject. We count declared bytes when the URL is
// minted (and again when an object is persisted) without any rollback, so an
// abandoned PUT still consumes quota. Once the daily byte budget is exceeded,
// the coarse `storageDay` token bucket locks the user out until UTC midnight.

import { BUDGETS, consume, getRedis } from "@spektrum/shared/rate-limit";
import type { UploadKind } from "./scoped-key";

const MIB = 1024 * 1024;

/** Per-object ceilings. A presigned PUT cannot enforce these; every consumer
 * of a signed key must check the object's actual size with getObject before
 * persisting the key, and the signing route rejects an oversized declaration. */
export const MAX_UPLOAD_BYTES: Record<UploadKind, number> = {
  import: 26 * MIB,
  workspace: 30 * MIB,
  "chat-image": 1 * MIB,
  render: 20 * MIB,
};

/** Total bytes a user may declare/persist in one UTC day on the free tier. */
export const DAILY_STORAGE_BYTES = 50 * MIB;

// INCRBY + lazy TTL in one atomic step: concurrent sign/commit calls cannot
// lose an increment or leave a counter key without an expiry.
const COUNT_BYTES_LUA = `
local total = redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]))
if redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return total
`;

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function msUntilUtcMidnight(now: Date): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, next - now.getTime());
}

export async function consumeStorageQuota(
  userId: string,
  bytes: number,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  if (!Number.isInteger(bytes) || bytes < 0) {
    throw new RangeError("invalid storage byte count");
  }
  const now = new Date();
  const key = `storage-bytes:${utcDay(now)}:${userId}`;
  const total = Number(
    await getRedis().eval(
      COUNT_BYTES_LUA,
      1,
      key,
      bytes,
      msUntilUtcMidnight(now),
    ),
  );
  if (total <= DAILY_STORAGE_BYTES) return { allowed: true, retryAfterMs: 0 };

  // Over budget: spend the coarse 1/day token to lock the user out for the rest
  // of the day. Retry-After also covers midnight in case the token bucket's
  // refill lands slightly after the UTC day boundary.
  const coarse = await consume(`storage:${userId}`, BUDGETS.storageDay);
  return {
    allowed: false,
    retryAfterMs: Math.max(coarse.retryAfterMs, msUntilUtcMidnight(now)),
  };
}
