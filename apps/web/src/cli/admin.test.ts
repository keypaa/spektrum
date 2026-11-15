// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({
  banUser: vi.fn(
    async (_input: { actorId: string; userId: string; reason: string }) => {},
  ),
  suspendUser: vi.fn(
    async (_input: {
      actorId: string;
      userId: string;
      until: Date;
      reason: string;
    }) => {},
  ),
  unbanUser: vi.fn(async (_input: { actorId: string; userId: string }) => {}),
}));

// The CLI resolves the actor first, then the target. The mock replays the
// expected lookups in order instead of trying to read generated SQL.
const state = vi.hoisted(() => ({
  users: [] as Array<{ id: string; email: string }>,
  queries: [] as string[],
}));

vi.mock("@/auth/admin", () => admin);
vi.mock("@spektrum/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const email = state.queries.shift();
            return state.users.filter((u) => u.email === email);
          },
        }),
      }),
    }),
  },
  pool: { end: async () => {} },
}));

import { run } from "./admin";

beforeEach(() => {
  admin.banUser.mockClear();
  admin.suspendUser.mockClear();
  admin.unbanUser.mockClear();
  state.users = [];
  state.queries = [];
});

const log = vi.spyOn(console, "log").mockImplementation(() => {});
const error = vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  log.mockClear();
  error.mockClear();
});

const users = () => {
  state.users = [
    { id: "u1", email: "bad@example.com" },
    { id: "a1", email: "admin@example.com" },
  ];
};

describe("admin CLI", () => {
  it("bans a user with the actor and reason", async () => {
    users();
    state.queries = ["admin@example.com", "bad@example.com"];
    const code = await run(["ban", "bad@example.com", "--actor", "admin@example.com", "--reason", "spam"]);
    expect(code).toBe(0);
    expect(admin.banUser).toHaveBeenCalledWith({
      actorId: "a1",
      userId: "u1",
      reason: "spam",
    });
  });

  it("suspends until an absolute date", async () => {
    users();
    state.queries = ["admin@example.com", "bad@example.com"];
    const code = await run(["suspend", "bad@example.com", "--actor", "admin@example.com", "--minutes", "60", "--reason", "cooldown"]);
    expect(code).toBe(0);
    const call = admin.suspendUser.mock.calls[0]![0];
    expect(call.actorId).toBe("a1");
    expect(call.userId).toBe("u1");
    expect(call.reason).toBe("cooldown");
    expect(call.until.getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);
  });

  it("unbans with the actor", async () => {
    users();
    state.queries = ["admin@example.com", "bad@example.com"];
    const code = await run(["unban", "bad@example.com", "--actor", "admin@example.com"]);
    expect(code).toBe(0);
    expect(admin.unbanUser).toHaveBeenCalledWith({ actorId: "a1", userId: "u1" });
  });

  it("refuses without an actor, because admin_actions.actor_id is not null", async () => {
    users();
    const code = await run(["ban", "bad@example.com", "--reason", "spam"]);
    expect(code).toBe(1);
    expect(admin.banUser).not.toHaveBeenCalled();
  });

  it("fails on an unknown target", async () => {
    users();
    state.queries = ["bad@example.com", "nobody@example.com"];
    expect(await run(["ban", "nobody@example.com", "--actor", "bad@example.com"])).toBe(1);
    expect(admin.banUser).not.toHaveBeenCalled();
  });

  it("fails on an unknown actor", async () => {
    users();
    state.queries = ["nobody@example.com"];
    expect(await run(["ban", "bad@example.com", "--actor", "nobody@example.com"])).toBe(1);
    expect(admin.banUser).not.toHaveBeenCalled();
  });

  it("requires a positive --minutes for suspend", async () => {
    users();
    state.queries = ["admin@example.com", "bad@example.com"];
    expect(await run(["suspend", "bad@example.com", "--actor", "admin@example.com"])).toBe(1);
    expect(admin.suspendUser).not.toHaveBeenCalled();
  });

  it("rejects an unknown action", async () => {
    expect(await run(["delete", "bad@example.com"])).toBe(1);
  });
});