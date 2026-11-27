// Stateless Redis over Upstash's REST API — serverless plan Task 10.
// Vercel functions cannot keep TCP sockets, so every command is one HTTP POST
// carrying the command as a JSON array (Upstash's documented REST protocol).
// REST supports EVAL / GET / SET / INCR / DEL / EXPIRE / GETDEL / PING /
// PUBLISH, but there is no socket to SUBSCRIBE on: consumers that need to
// receive pub/sub messages must poll the database on this branch.

/** The subset of ioredis our call sites use, implemented by both transports. */
export interface RedisLike {
  eval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<unknown>;
  incr(key: string): Promise<number>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  getdel(key: string): Promise<string | null>;
  ping(): Promise<string>;
  publish(channel: string, message: string): Promise<number>;
  quit(): Promise<void>;
}

/** Minimal injectable HTTP client (the global `fetch` satisfies it). */
export type RedisRestFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface RestRedisOptions {
  url: string;
  token: string;
  /** Override the HTTP client — used by tests with a fake HTTP client. */
  fetch?: RedisRestFetch;
}

/** Build a RedisLike that speaks Upstash REST instead of the Redis protocol. */
export function createRestRedis(options: RestRedisOptions): RedisLike {
  const { url, token } = options;
  const http: RedisRestFetch =
    options.fetch ??
    ((requestUrl, init) => globalThis.fetch(requestUrl, init));

  async function command(args: (string | number)[]): Promise<unknown> {
    const name = String(args[0]);
    const response = await http(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // The REST protocol takes an array of Redis-protocol (string) arguments.
      body: JSON.stringify(args.map(String)),
    });
    let payload: { result?: unknown; error?: unknown } | undefined;
    try {
      payload = (await response.json()) as { result?: unknown; error?: unknown };
    } catch {
      // A non-JSON error body still deserves a useful, token-free message.
    }
    const detail =
      payload && typeof payload.error === "string" ? payload.error : undefined;
    if (!response.ok) {
      throw new Error(
        `Redis REST ${name} failed (${response.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    if (detail) throw new Error(`Redis REST ${name} failed: ${detail}`);
    return payload?.result ?? null;
  }

  const numeric = async (args: (string | number)[]): Promise<number> =>
    Number(await command(args));

  return {
    eval: (script, numKeys, ...args) =>
      command(["EVAL", script, numKeys, ...args]),
    get: (key) => command(["GET", key]) as Promise<string | null>,
    set: (key, value, ...args) => command(["SET", key, value, ...args]),
    incr: (key) => numeric(["INCR", key]),
    del: (key) => numeric(["DEL", key]),
    expire: (key, seconds) => numeric(["EXPIRE", key, seconds]),
    getdel: (key) => command(["GETDEL", key]) as Promise<string | null>,
    ping: () => command(["PING"]) as Promise<string>,
    publish: (channel, message) => numeric(["PUBLISH", channel, message]),
    // REST has no persistent connection to close; closeRateLimiter still
    // drops the cached adapter, so no QUIT command is sent (Upstash rejects
    // connection commands other than PING/ECHO).
    quit: async () => undefined,
  };
}
