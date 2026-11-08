import { redirect } from "next/navigation";
import { requireUser, UnauthorizedError, ForbiddenError } from "@/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  try {
    await requireUser();
  } catch (e) {
    // spec §19.1: UnauthorizedError -> redirect to /login, ForbiddenError ->
    // a forbidden notice (a banned/suspended cookie never reaches the app)
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
  return <h1>Your Projects</h1>;
}
