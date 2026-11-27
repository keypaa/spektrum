// Stateless Redis adapter — serverless plan Task 10.
// The REST path must speak Upstash's HTTP command protocol while preserving
// every method our call sites use (rate limiting, Better Auth secondary
// storage, health ping and conflict-event publishing).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUDGETS,
  closeRateLimiter,
  consume,
  getRedis,
  redisSecondaryStorage,
} from "./rate-limit";
import { createRestRedis } from "./rate-limit-rest";

const REST_URL = "https://rest.upstash.example/redis";
const TOKEN = "test-rest-token";

type FakeCall = {
  url: string;
  command: string[];
  headers: Record<string, string>;
};

function fakeFetch(result: (command: string[]) => unknown) {
  const calls: FakeCall[] = [];
  const impl = vi.fn(async (url: string | URL, init: RequestInit) => {
    const command = JSON.parse(String(init.body)) as string[];
    calls.push({
      url: String(url),
      command,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
    });
    return new Response(JSON.stringify({ result: result(command) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { calls, impl };
}

function useRestEnv() {
  vi.stubEnv("REDIS_URL", undefined);
  vi.stubEnv("UPSTASH_REDIS_REST_URL", REST_URL);
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", TOKEN);
}

afterEach(async () => {
  await closeRateLimiter();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createRestRedis", () => {
  it("forwards every call site command with bearer auth", async () => {
    const { calls, impl } = fakeFetch((command) => {
      switch (command[0]) {
        case "GET":
        case "GETDEL":
          return '{"a":1}';
        case "INCR":
        case "DEL":
        case "EXPIRE":
          return 1;
        case "PING":
          return "PONG";
        case "PUBLISH":
          return 2;
        default:
          return "OK";
      }
    });
    const redis = createRestRedis({ url: REST_URL, token: TOKEN, fetch: impl });

    expect(await redis.eval("return 1", 1, "k", 2)).toBe("OK");
    expect(await redis.get("k")).toBe('{"a":1}');
    expect(await redis.set("k", "v")).toBe("OK");
    expect(await redis.set("k", "v", "EX", 10)).toBe("OK");
    expect(await redis.incr("k")).toBe(1);
    expect(await redis.del("k")).toBe(1);
    expect(await redis.expire("k", 10)).toBe(1);
    expect(await redis.getdel("k")).toBe('{"a":1}');
    expect(await redis.ping()).toBe("PONG");
    expect(await redis.publish("render:project", "hi")).toBe(2);

    expect(calls.map((c) => c.command)).toEqual([
      ["EVAL", "return 1", "1", "k", "2"],
      ["GET", "k"],
      ["SET", "k", "v"],
      ["SET", "k", "v", "EX", "10"],
      ["INCR", "k"],
      ["DEL", "k"],
      ["EXPIRE", "k", "10"],
      ["GETDEL", "k"],
      ["PING"],
      ["PUBLISH", "render:project", "hi"],
    ]);
    for (const call of calls) {
      expect(call.url).toBe(REST_URL);
      expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(call.headers["content-type"]).toBe("application/json");
    }
  });

  it("quit closes nothing over REST (no socket, no HTTP call)", async () => {
    const { calls, impl } = fakeFetch(() => "OK");
    const redis = createRestRedis({ url: REST_URL, token: TOKEN, fetch: impl });
    await expect(redis.quit()).resolves.toBeUndefined();
    expect(impl).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("reports REST errors without echoing the bearer token", async () => {
    const impl = vi.fn(async (_url: string | URL, _init: RequestInit) =>
      new Response(JSON.stringify({ error: "WRONGTYPE bad key" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const redis = createRestRedis({ url: REST_URL, token: TOKEN, fetch: impl });
    await expect(redis.get("k")).rejects.toThrow(/WRONGTYPE bad key/);
    await expect(redis.get("k")).rejects.not.toThrow(new RegExp(TOKEN));
  });
});

describe("getRedis selection", () => {
  it("uses the REST adapter when only Upstash REST env vars are set", async () => {
    useRestEnv();
    const { calls, impl } = fakeFetch(() => "OK");
    vi.stubGlobal("fetch", impl);

    await getRedis().set("rest:key", "value");
    expect(calls.map((c) => c.command)).toEqual([["SET", "rest:key", "value"]]);
  });

  it("keeps the ioredis path when REDIS_URL is set", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", REST_URL);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", TOKEN);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const redis = getRedis();
    const key = `rest:tcp:${Date.now()}`;
    await redis.set(key, "v");
    expect(await redis.get(key)).toBe("v");
    expect(await redis.del(key)).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses REST when REDIS_URL is present but empty (as copied from .env.example)", async () => {
    // Vercel env values copied from .env.example carry REDIS_URL=""; an empty
    // value must not select ioredis, whose sockets cannot work on Vercel.
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", REST_URL);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", TOKEN);
    const { calls, impl } = fakeFetch(() => "OK");
    vi.stubGlobal("fetch", impl);

    await getRedis().set("rest:empty-tcp-url", "v");
    expect(calls.map((c) => c.command)).toEqual([
      ["SET", "rest:empty-tcp-url", "v"],
    ]);
  });

  it("fails loudly when neither Redis configuration is present", () => {
    vi.stubEnv("REDIS_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    expect(() => getRedis()).toThrow(/REDIS_URL|UPSTASH_REDIS_REST/);
  });
});

describe("existing consumers over REST", () => {
  it("consume() runs its Lua script through the fake HTTP client", async () => {
    useRestEnv();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const { calls, impl } = fakeFetch(() => [1, 0]);
    vi.stubGlobal("fetch", impl);

    expect(await consume("rest-user", BUDGETS.signIn)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    const [command] = calls;
    expect(command?.command[0]).toBe("EVAL");
    expect(String(command?.command[1])).toContain("redis.call('HMGET'");
    expect(command?.command.slice(2)).toEqual([
      "1",
      "rl:rest-user",
      "1700000000000",
      "5",
      String(5 / (15 * 60_000)),
      String(30 * 60_000),
    ]);

    impl.mockImplementationOnce(async (_url, _init) =>
      new Response(JSON.stringify({ result: [0, 1234] }), { status: 200 }),
    );
    expect(await consume("rest-user", BUDGETS.signIn)).toEqual({
      allowed: false,
      retryAfterMs: 1234,
    });
  });

  it("Better Auth secondary storage keeps working over REST", async () => {
    useRestEnv();
    const { calls, impl } = fakeFetch((command) => {
      if (command[0] === "GET" || command[0] === "GETDEL") return '{"v":1}';
      if (command[0] === "INCR") return 1;
      return "OK";
    });
    vi.stubGlobal("fetch", impl);

    const storage = redisSecondaryStorage();
    await storage.set("session", '{"v":1}', 30);
    expect(await storage.get("session")).toEqual({ v: 1 });
    await storage.delete("session");
    expect(await storage.getAndDelete("session")).toEqual({ v: 1 });
    expect(await storage.increment("counter", 60)).toBe(1);

    expect(calls.map((c) => c.command)).toEqual([
      ["SET", "ba:session", '{"v":1}', "EX", "30"],
      ["GET", "ba:session"],
      ["DEL", "ba:session"],
      ["GETDEL", "ba:session"],
      ["INCR", "ba:counter"],
      ["EXPIRE", "ba:counter", "60"],
    ]);
  });
});
