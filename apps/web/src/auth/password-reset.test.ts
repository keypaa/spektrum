import { afterAll, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { verifications } from "@spektrum/db/schema";
import { auth } from "./auth";
import { hashPassword } from "./password";
import { POST as changePasswordRoute } from "@/app/api/auth/change-password/route";
import { POST as resetPasswordRoute } from "@/app/api/auth/reset-password/route";

// Phase 0 plan, Review Focus #1: a password-reset token is single-use, and a
// password change invalidates any outstanding reset token (spec §10.2).
//
// Better Auth owns POST /reset-password and POST /change-password. Reset tokens
// are written as `reset-password:<token>` but stored as a hash (auth.ts wires
// `storeIdentifier` to hashResetIdentifier), exactly as the real
// request-password-reset endpoint writes them; the tests seed them through the
// same internal adapter, then drive the production route wrappers, so the real
// consume + invalidation path is what is exercised.
const run = Math.random().toString(36).slice(2, 10);
const oldPassword = "reset test old password";

let ipCounter = Math.floor(Math.random() * 1000);
function freshIp(): string {
  ipCounter += 1;
  return `10.54.${Math.floor(ipCounter / 250) % 250}.${ipCounter % 250}`;
}

function post(
  path: string,
  body: unknown,
  opts: { cookie?: string } = {},
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      // every request gets its own source IP so the 5-per-15-min sign-in
      // limiter never leaks between assertions
      "x-forwarded-for": freshIp(),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function makeUser(
  suffix: string,
): Promise<{ userId: string; email: string }> {
  const userId = `reset-${suffix}-${run}`;
  const email = `reset-${suffix}-${run}@test.local`;
  await db.execute(sql`delete from users where id = ${userId}`);
  await db.execute(sql`
    insert into users (id,email,name,email_verified,role,banned)
    values (${userId}, ${email}, 'R', true, 'member', false)`);
  await db.execute(sql`
    insert into accounts (id,user_id,provider_id,account_id,password)
    values (${`acct-${suffix}-${run}`}, ${userId}, 'credential', ${userId},
            ${await hashPassword(oldPassword)})`);
  return { userId, email };
}

async function seedResetToken(
  userId: string,
  token: string,
  ttlMs = 30 * 60_000,
): Promise<void> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.createVerificationValue({
    value: userId,
    identifier: `reset-password:${token}`,
    expiresAt: new Date(Date.now() + ttlMs),
  });
}

afterAll(async () => {
  await db.execute(sql`delete from users where id like ${`reset-%-${run}`}`);
  // verifications has no FK to users; clear the seeded tokens explicitly
  await db.execute(
    sql`delete from verifications where value like ${`reset-%-${run}`}`,
  );
  await pool.end();
});

it("a reset token works exactly once", async () => {
  const { userId, email } = await makeUser("single");
  const token = `single-${run}`;
  const sibling = `single-sibling-${run}`;
  await seedResetToken(userId, token);
  await seedResetToken(userId, sibling);

  // spec §10.2: the token itself is never stored — only a hash of it
  const stored = await db
    .select({ identifier: verifications.identifier })
    .from(verifications)
    .where(
      and(
        eq(verifications.value, userId),
        like(verifications.identifier, "reset-password:%"),
      ),
    );
  expect(stored).toHaveLength(2);
  for (const row of stored) {
    expect(row.identifier).not.toBe(`reset-password:${token}`);
    expect(row.identifier).not.toBe(`reset-password:${sibling}`);
    expect(row.identifier).not.toContain(token);
  }

  const reset = await resetPasswordRoute(
    post("/api/auth/reset-password", {
      token,
      newPassword: "brand new password one",
    }),
  );
  expect(reset.status).toBe(200);

  // the new password works; the old one no longer does
  const newLogin = await auth.handler(
    post("/api/auth/sign-in/email", {
      email,
      password: "brand new password one",
    }),
  );
  expect(newLogin.status).toBe(200);
  const oldLogin = await auth.handler(
    post("/api/auth/sign-in/email", { email, password: oldPassword }),
  );
  expect(oldLogin.status).toBe(401);

  // Review Focus #1: the second use of the same token must fail
  const reuse = await resetPasswordRoute(
    post("/api/auth/reset-password", {
      token,
      newPassword: "brand new password two",
    }),
  );
  expect(reuse.status).toBe(400);
  expect(((await reuse.json()) as { code?: string }).code).toBe(
    "INVALID_TOKEN",
  );

  // spec §10.2: a password change (here via reset) also kills sibling tokens
  const siblingReset = await resetPasswordRoute(
    post("/api/auth/reset-password", {
      token: sibling,
      newPassword: "sibling should never land",
    }),
  );
  expect(siblingReset.status).toBe(400);
}, 30_000);

it("changing the password invalidates an outstanding reset token", async () => {
  const { userId, email } = await makeUser("change");
  const token = `change-${run}`;
  await seedResetToken(userId, token);

  const signIn = await auth.handler(
    post("/api/auth/sign-in/email", { email, password: oldPassword }),
  );
  expect(signIn.status).toBe(200);
  const cookie = signIn.headers.get("set-cookie")!.split(";")[0]!;

  const change = await changePasswordRoute(
    post(
      "/api/auth/change-password",
      {
        currentPassword: oldPassword,
        newPassword: "changed password for life",
      },
      { cookie },
    ),
  );
  expect(change.status).toBe(200);

  // spec §10.2: invalidated on password change — the outstanding token is dead
  const reset = await resetPasswordRoute(
    post("/api/auth/reset-password", {
      token,
      newPassword: "should never land here",
    }),
  );
  expect(reset.status).toBe(400);
  expect(((await reset.json()) as { code?: string }).code).toBe(
    "INVALID_TOKEN",
  );

  // and the password really is the changed one
  const changedLogin = await auth.handler(
    post("/api/auth/sign-in/email", {
      email,
      password: "changed password for life",
    }),
  );
  expect(changedLogin.status).toBe(200);
}, 30_000);

it("rejects an expired reset token", async () => {
  const { userId } = await makeUser("expired");
  await seedResetToken(userId, `expired-${run}`, -1_000);

  const reset = await resetPasswordRoute(
    post("/api/auth/reset-password", {
      token: `expired-${run}`,
      newPassword: "expired token password",
    }),
  );
  expect(reset.status).toBe(400);
  expect(((await reset.json()) as { code?: string }).code).toBe(
    "INVALID_TOKEN",
  );
}, 30_000);
