// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dbOk: true,
  redisOk: true,
}));

vi.mock("@spektrum/db", () => ({
  db: {
    execute: async () => {
      if (!state.dbOk) throw new Error("db down");
      return {};
    },
  },
}));
vi.mock("@spektrum/shared/rate-limit", () => ({
  getRedis: () => ({
    ping: async () => {
      if (!state.redisOk) throw new Error("redis down");
      return "PONG";
    },
  }),
}));

import { GET } from "./route";

const OLD_ENV = { ...process.env };

beforeEach(() => {
  state.dbOk = true;
  state.redisOk = true;
});

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("GET /api/health", () => {
  it("reports each dependency", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "up", redis: "up" });
  });

  it("is 503 when postgres is down", async () => {
    state.dbOk = false;
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: "down", redis: "up" });
  });

  it("is 503 when redis is down", async () => {
    state.redisOk = false;
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: "up", redis: "down" });
  });
});