// The single Better Auth instance — spec §10.
// Constructed LAZILY (Proxy) so that importing this module during `next build`
// page-data collection does not require env vars; loadWebEnv() runs on first
// real use, where fail-fast belongs.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { admin } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { db } from "@spektrum/db";
import * as schema from "@spektrum/db/schema";
import { loadWebEnv } from "@spektrum/shared/env";
import { hashPassword, verifyPassword } from "./password";
import { assertSignupAllowed, hasValidInvite } from "./signup-gate";
import { validateProviderUserInfo } from "./oauth-gate";
import { RESET_TOKEN_PREFIX, hashResetIdentifier } from "./password-reset";
import { BUDGETS, redisSecondaryStorage } from "@spektrum/shared/rate-limit";

function createAuth() {
  const env = loadWebEnv();
  return betterAuth({
    baseURL: env.authUrl,
    secret: env.authSecret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      defaultCookieAttributes: {
        httpOnly: true,
        secure: env.nodeEnv === "production",
        sameSite: "lax",
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      // spec §10.2: reset tokens live for 30 minutes
      resetPasswordTokenExpiresIn: 30 * 60,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },
    socialProviders: {
      google: {
        clientId: env.googleClientId ?? "",
        clientSecret: env.googleClientSecret ?? "",
        scope: ["openid", "email", "profile"],
        // closed signup: a Google sign-in must not implicitly create an account
        disableImplicitSignUp: true,
      },
      // spec §10.4: the GitHub provider is written but only enabled when
      // credentials exist; it is never rendered in the UI before that.
      ...(env.githubClientId && env.githubClientSecret
        ? {
            github: {
              clientId: env.githubClientId,
              clientSecret: env.githubClientSecret,
              scope: ["read:user", "user:email"],
              disableImplicitSignUp: true,
            },
          }
        : {}),
    },
    account: {
      accountLinking: {
        enabled: true,
        // Google is trusted: a verified Google email links to the existing
        // local account with that email instead of creating a duplicate.
        trustedProviders: ["google"],
      },
    },
    user: {
      // OAuth identities must carry a provider-verified email (oauth-gate.ts)
      validateUserInfo: ({ user, source }) =>
        validateProviderUserInfo({ user, source }),
    },
    session: {
      expiresIn: 30 * 24 * 60 * 60, // 30 days
      updateAge: 24 * 60 * 60, // rolling refresh daily
      cookieCache: { enabled: false }, // bans visible on the next request
      // spec §10.3: database sessions are the store of record. Redis secondary
      // storage is an additional cache (and the rate-limit store), not the
      // session store — otherwise flushing Redis resurrects revoked sessions
      // and deleting a DB row leaves the cached one alive.
      storeSessionInDatabase: true,
    },
    // spec §10.2: verification values (reset tokens included) are stored
    // hashed, and the database is the store of record — the Redis copy is only
    // a cache. That makes single-use and password-change invalidation survive
    // a cache flush. The reset-token override keeps the purpose prefix visible
    // so outstanding tokens can be selected per user.
    verification: {
      storeInDatabase: true,
      storeIdentifier: {
        default: "hashed",
        overrides: {
          [RESET_TOKEN_PREFIX]: { hash: hashResetIdentifier },
        },
      },
    },
    // spec §10.5: /api/auth/* limited by Better Auth itself, backed by Redis
    // so limits are shared across instances (5 sign-in attempts / 15 min / IP)
    secondaryStorage: redisSecondaryStorage(),
    rateLimit: {
      enabled: true, // default is production-only; we want it in dev/e2e too
      storage: "secondary-storage",
      window: 10,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 15 * 60, max: 5 },
        // free-tier abuse control: public signup is capped by the shared
        // budget (3 / 15 min per IP) rather than the generic 5 / 15 min.
        "/sign-up/email": {
          window: BUDGETS.signup.windowMs / 1000, // Better Auth uses seconds
          max: BUDGETS.signup.limit,
        },
      },
    },
    plugins: [
      admin({
        defaultRole: "member",
        // spec §10.1: owner and admin both carry the admin access controller
        adminRoles: ["owner", "admin"],
        roles: { owner: adminAc, admin: adminAc, member: userAc },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            assertSignupAllowed({
              email: user.email,
              allowPublicSignup: env.allowPublicSignup,
              hasValidInvite: await hasValidInvite(user.email),
            });
            return { data: user };
          },
        },
      },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;

let _auth: Auth | undefined;

function getAuth(): Auth {
  return (_auth ??= createAuth());
}

export const auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuth(), prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(getAuth(), prop);
  },
});
