// The single Better Auth instance — spec §10.
// Constructed LAZILY (Proxy) so that importing this module during `next build`
// page-data collection does not require env vars; loadWebEnv() runs on first
// real use, where fail-fast belongs.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { admin } from "better-auth/plugins";
import { db } from "@spektrum/db";
import * as schema from "@spektrum/db/schema";
import { loadWebEnv } from "@spektrum/shared/env";
import { hashPassword, verifyPassword } from "./password";
import { assertSignupAllowed, hasValidInvite } from "./signup-gate";
import { validateProviderUserInfo } from "./oauth-gate";

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
    },
    plugins: [admin({ defaultRole: "member", adminRoles: ["admin"] })],
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
