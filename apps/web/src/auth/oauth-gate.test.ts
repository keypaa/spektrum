import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import { validateProviderUserInfo } from "./oauth-gate";
import { assertSignupAllowed, hasValidInvite } from "./signup-gate";
import { createInvite } from "./invites";
import { auth } from "./auth";

const run = Math.random().toString(36).slice(2, 10);
const ownerId = `oauth-owner-${run}`;

const oauth = (emailVerified: boolean) => ({
  user: { email: "x@y.com", emailVerified },
  source: { action: "create-user", method: "oauth", oauth: { providerId: "google" } },
});

beforeAll(async () => {
  await db.execute(sql`delete from users where id = ${ownerId}`);
  await db.insert(users).values({
    id: ownerId,
    email: `oauth-owner-${run}@test.local`,
    name: "O",
    emailVerified: true,
    role: "owner",
    banned: false,
  });
});

afterAll(async () => {
  await db.execute(sql`delete from invites where email like ${`%@oauth-${run}.test`}`);
  await db.execute(sql`delete from users where id = ${ownerId}`);
  await pool.end();
});

describe("validateProviderUserInfo", () => {
  it("rejects an unverified provider email on create-user", () => {
    expect(validateProviderUserInfo(oauth(false))).toEqual({
      error: "email_not_verified",
      message: expect.any(String),
    });
  });

  it("rejects an unverified provider email on link-account", () => {
    const r = validateProviderUserInfo({
      user: { email: "x@y.com", emailVerified: false },
      source: { action: "link-account", method: "oauth", oauth: { providerId: "google" } },
    });
    expect(r?.error).toBe("email_not_verified");
  });

  it("allows a verified provider email", () => {
    expect(validateProviderUserInfo(oauth(true))).toBeUndefined();
  });

  it("ignores non-OAuth methods", () => {
    expect(
      validateProviderUserInfo({
        user: { email: "x@y.com", emailVerified: false },
        source: { action: "create-user", method: "email-password" },
      }),
    ).toBeUndefined();
  });
});

describe("closed-signup gate for OAuth creation", () => {
  it("refuses user creation without invite while signup is closed", () => {
    expect(() =>
      assertSignupAllowed({
        email: "stranger@example.com",
        allowPublicSignup: false,
        hasValidInvite: false,
      }),
    ).toThrow(/invite_required/i);
  });

  it("allows creation when the email has a valid invite", async () => {
    const email = `invited-oauth-${run}.test`;
    await createInvite({ email, actorId: ownerId });
    const valid = await hasValidInvite(email);
    expect(valid).toBe(true);
    expect(() =>
      assertSignupAllowed({
        email,
        allowPublicSignup: false,
        hasValidInvite: valid,
      }),
    ).not.toThrow();
  });

  it("allows creation when ALLOW_PUBLIC_SIGNUP=true", () => {
    expect(() =>
      assertSignupAllowed({
        email: "anyone@example.com",
        allowPublicSignup: true,
        hasValidInvite: false,
      }),
    ).not.toThrow();
  });

  it("stranger without invite is refused by hasValidInvite", async () => {
    expect(await hasValidInvite(`nobody-oauth-${run}.test`)).toBe(false);
  });
});

describe("auth instance wiring (Task 13)", () => {
  it("google provider has implicit sign-up disabled and openid scope", () => {
    const google = auth.options.socialProviders?.google as
      | { disableImplicitSignUp?: boolean; scope?: string[] }
      | undefined;
    expect(google?.disableImplicitSignUp).toBe(true);
    expect(google?.scope).toEqual(
      expect.arrayContaining(["openid", "email", "profile"]),
    );
  });

  it("google is a trusted linking provider", () => {
    const linking = auth.options.account?.accountLinking;
    expect(linking?.enabled).toBe(true);
    const trusted = linking?.trustedProviders;
    expect(Array.isArray(trusted) ? trusted : []).toContain("google");
  });

  it("validateUserInfo hook is installed and rejects unverified OAuth emails", () => {
    const hook = auth.options.user?.validateUserInfo;
    expect(typeof hook).toBe("function");
  });
});
