// Redis rate limiting — spec §10.5.
// Two consumers:
//  1. OUR application routes: `consume(key, BUDGETS.x)` — a token bucket per
//     key (sustained `limit` per `windowMs`, optional `burst` capacity),
//     enforced atomically by a single Lua script so concurrent instances
//     cannot bypass it.
//  2. Better Auth's own /api/auth/* endpoints: `redisSecondaryStorage()`
//     implements the SecondaryStorage interface over the same Redis, and
//     auth.ts points rateLimit.storage at it (sign-in: 5 / 15 min).
import Redis from "ioredis";

export type Budget = { limit: number; windowMs: number; burst?: number };

/** Per-route budgets, spec §10.5. */
export const BUDGETS = {
  signIn: { limit: 5, windowMs: 15 * 60_000 },
  compile: { limit: 6, windowMs: 60_000, burst: 12 },
  compileHourly: { limit: 60, windowMs: 3_600_000 },
  ai: { limit: 30, windowMs: 60_000 },
  upload: { limit: 20, windowMs: 60_000 },
  // audit addition: the invite-redemption route lives under /api/auth/* but is
  // our own handler, so Better Auth's limiter does not cover it
  inviteRedeem: { limit: 5, windowMs: 15 * 60_000 },
} as const;

let _redis: Redis | undefined;

export function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not set");
    _redis = new Redis(url, { maxRetriesPerRequest: 2 });
  }
  return _redis;
}

export async function closeRateLimiter(): Promise<void> {
  const r = _redis;
  _redis = undefined;
  if (r) await r.quit();
}

// Token bucket: state = { t: tokens, ts: lastSeenMs } in a Redis hash.
// capacity = burst ?? limit; refill = limit / windowMs per ms.
const CONSUME_LUA = `
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refillPerMs = tonumber(ARGV[3])
local ttlMs = tonumber(ARGV[4])
local state = redis.call('HMGET', KEYS[1], 't', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil then tokens = capacity end
if ts == nil then ts = now end
local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * refillPerMs)
local allowed = tokens >= 1
local retryAfterMs = 0
if allowed then
  tokens = tokens - 1
else
  retryAfterMs = math.ceil((1 - tokens) / refillPerMs)
end
redis.call('HMSET', KEYS[1], 't', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], ttlMs)
return { allowed and 1 or 0, retryAfterMs }
`;

export async function consume(
  key: string,
  budget: Budget,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const capacity = budget.burst ?? budget.limit;
  const refillPerMs = budget.limit / budget.windowMs;
  const ttlMs = budget.windowMs * 2; // keep state long enough for a full refill
  const res = (await getRedis().eval(
    CONSUME_LUA,
    1,
    `rl:${key}`,
    Date.now(),
    capacity,
    refillPerMs,
    ttlMs,
  )) as [number, number];
  return { allowed: res[0] === 1, retryAfterMs: Number(res[1] ?? 0) };
}

// ---------------------------------------------------------------------------
// Better Auth SecondaryStorage over Redis (keys prefixed ba:)
// ---------------------------------------------------------------------------

export interface SecondaryStorageLike {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
  getAndDelete: (key: string) => Promise<unknown>;
  increment: (key: string, ttl: number) => Promise<number>;
}

export function redisSecondaryStorage(): SecondaryStorageLike {
  const redis = getRedis();
  const p = (key: string) => `ba:${key}`;
  return {
    get: async (key) => {
      const v = await redis.get(p(key));
      return v === null ? null : JSON.parse(v);
    },
    set: async (key, value, ttl) => {
      if (ttl && ttl > 0) await redis.set(p(key), value, "EX", Math.ceil(ttl));
      else await redis.set(p(key), value);
    },
    delete: async (key) => {
      await redis.del(p(key));
    },
    getAndDelete: async (key) => {
      const v = await redis.getdel(p(key));
      return v === null ? null : JSON.parse(v);
    },
    increment: async (key, ttl) => {
      const n = await redis.incr(p(key));
      if (n === 1) await redis.expire(p(key), Math.ceil(ttl));
      return n;
    },
  };
}
