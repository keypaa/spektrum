import { describe, expect, it } from "vitest";
import { BUDGETS } from "@spektrum/shared/rate-limit";
import { auth } from "./auth";
import { assertSignupAllowed } from "./signup-gate";

type AdminPlugin = {
  id: string;
  options?: { defaultRole?: string; adminRoles?: string[] };
};

describe("public signup gate", () => {
  it("denies a stranger while the switch is off", () => {
    expect(() =>
      assertSignupAllowed({
        email: "stranger@example.com",
        allowPublicSignup: false,
        hasValidInvite: false,
      }),
    ).toThrow(/invite_required/i);
  });

  it("allows a stranger when the deployment switch is on", () => {
    expect(() =>
      assertSignupAllowed({
        email: "stranger@example.com",
        allowPublicSignup: true,
        hasValidInvite: false,
      }),
    ).not.toThrow();
  });

  it("still accepts an invite and the owner bootstrap while closed", () => {
    expect(() =>
      assertSignupAllowed({
        email: "invited@example.com",
        allowPublicSignup: false,
        hasValidInvite: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertSignupAllowed({
        email: "owner@example.com",
        allowPublicSignup: false,
        hasValidInvite: false,
        allowBootstrap: true,
      }),
    ).not.toThrow();
  });

  it("only decides admission — it never grants a role", () => {
    expect(
      assertSignupAllowed({
        email: "new@example.com",
        allowPublicSignup: true,
        hasValidInvite: false,
      }),
    ).toBeUndefined();
  });
});

describe("public signups can only be members", () => {
  it("uses the admin plugin's member default and keeps admin roles elevated-only", () => {
    const adminPlugin = auth.options.plugins?.find(
      (p) => p.id === "admin",
    ) as AdminPlugin | undefined;
    expect(adminPlugin?.options?.defaultRole).toBe("member");
    expect(adminPlugin?.options?.adminRoles).toEqual(["owner", "admin"]);
  });
});

describe("auth build gate", () => {
  // Importing auth.ts pulls in @node-rs/argon2. On Vercel's Amazon Linux image
  // a broken native build would fail here (or at first signup); Task 11 runs
  // this on a Preview deployment before the public signup switch is flipped.
  it("hashes and verifies a password through the hasher wired into auth.ts", async () => {
    const password = auth.options.emailAndPassword?.password;
    expect(typeof password?.hash).toBe("function");
    expect(typeof password?.verify).toBe("function");

    const plain = "correct horse battery staple";
    // Better Auth calls hash(plainString) and verify({ hash, password }).
    const hash = await password!.hash!(plain);
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).toMatch(/m=19456,t=2,p=1/);
    await expect(password!.verify!({ hash, password: plain })).resolves.toBe(true);
    await expect(
      password!.verify!({ hash, password: "a different long password" }),
    ).resolves.toBe(false);
  });

  it("throttles /sign-up/email at the pinned 3 per 15 minutes budget", () => {
    expect(auth.options.rateLimit?.customRules?.["/sign-up/email"]).toEqual({
      window: BUDGETS.signup.windowMs / 1000,
      max: BUDGETS.signup.limit,
    });
  });
});
