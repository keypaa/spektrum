import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import { DashboardClient } from "./dashboard/dashboard-client";
import { listProjects } from "@/lib/projects";
import { requireUser, UnauthorizedError, ForbiddenError } from "@/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    // spec §19.1: UnauthorizedError -> redirect to /login, ForbiddenError ->
    // a banned/suspended cookie never reaches the app
    if (e instanceof UnauthorizedError) {
      redirect(`/login?from=${encodeURIComponent("/")}`);
    }
    if (e instanceof ForbiddenError) {
      const suspended = e.retryAfterMs !== undefined;
      return (
        <main style={{ padding: 32 }}>
          <h1>Access restricted</h1>
          <p>
            {suspended
              ? "Your account is suspended."
              : "Your account has been banned. Contact support if you believe this is an error."}
          </p>
        </main>
      );
    }
    throw e;
  }

  const [profile] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const projects = await listProjects(user.id);
  return (
    <DashboardClient
      userName={profile?.name ?? user.email}
      userEmail={user.email}
      projects={projects}
      bannerEnabled={process.env.SHUTDOWN_BANNER === "true"}
    />
  );
}
