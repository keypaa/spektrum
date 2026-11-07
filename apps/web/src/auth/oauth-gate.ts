// OAuth provider user-info gate — spec §10.4.
// Wired as Better Auth's `user.validateUserInfo` hook in auth.ts.
// Rules:
//  - an OAuth provider must assert a VERIFIED email before we create or link
//    anything (otherwise anyone could claim an arbitrary email via a custom
//    OIDC provider);
//  - non-OAuth methods (email/password, etc.) are left alone.
// The closed-signup gate itself lives in databaseHooks.user.create.before
// (signup-gate.ts) and is the backstop for any provider creation path.

export type ProviderUserInfo = {
  user: { email?: string; emailVerified?: boolean };
  source: {
    action: "create-user" | "link-account" | "sign-in" | string;
    method: string;
    oauth?: { providerId: string } | undefined;
  };
};

export function validateProviderUserInfo(
  input: ProviderUserInfo,
): { error: string; message: string } | void {
  if (input.source.method !== "oauth") return;
  if (!input.user.emailVerified) {
    return {
      error: "email_not_verified",
      message: "The provider did not verify this email address",
    };
  }
}
