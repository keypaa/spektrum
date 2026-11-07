import { describe, expect, it } from "vitest";
import { assertBanState } from "./ban-state";

const now = new Date("2026-11-07T12:00:00Z");

describe("assertBanState", () => {
  it("accepts an unbanned user", () => {
    expect(assertBanState({ banned: false, banExpires: null }, now)).toEqual({
      ok: true,
    });
  });

  it("rejects a permanent ban", () => {
    expect(
      assertBanState({ banned: true, banExpires: null }, now),
    ).toEqual({ ok: false, reason: "banned" });
  });

  it("rejects a suspension whose expiry has not elapsed", () => {
    expect(
      assertBanState(
        { banned: true, banExpires: new Date("2026-11-08T00:00:00Z") },
        now,
      ),
    ).toEqual({ ok: false, reason: "suspended", retryAfterMs: 43_200_000 });
  });

  it("accepts a user whose ban has expired — the ladder lifts itself", () => {
    expect(
      assertBanState(
        { banned: true, banExpires: new Date("2026-11-06T00:00:00Z") },
        now,
      ),
    ).toEqual({ ok: true });
  });
});
