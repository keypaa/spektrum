// Minimal Better Auth config used ONLY by the CLI to generate the Drizzle schema
// (`pnpm dlx auth@1.7.18 generate`). Task 7 replaces this with the full instance.
// The admin plugin adds users.role/banned/ban_reason/ban_expires and
// sessions.impersonated_by regardless of the roles map.
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [admin({ defaultRole: "member", adminRoles: ["admin"] })],
});
