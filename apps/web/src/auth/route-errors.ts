// Maps our thrown errors to proper HTTP responses for route handlers.
// Pages (RSC) cannot use this — they translate the same errors into
// redirect("/login") / a forbidden notice instead (see app/(app)/page.tsx).
//
// Status contract (spec §10.5, §19.1):
//   UnauthorizedError            -> 401 { error: "unauthorized" }
//   ForbiddenError (suspended)   -> 429 + Retry-After (seconds)
//   ForbiddenError (banned/role) -> 403
//   CsrfError                    -> 403
//   ZodError                     -> 400 with issues
//   anything else                -> 500 with a GENERIC message (no internals)
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError, ForbiddenError } from "./session";
import { CsrfError } from "@spektrum/shared/http/guard";

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof UnauthorizedError) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (e instanceof ForbiddenError) {
    const suspended = e.retryAfterMs !== undefined;
    const headers: Record<string, string> = {};
    if (suspended) {
      headers["retry-after"] = String(Math.max(1, Math.ceil(e.retryAfterMs! / 1000)));
    }
    const message =
      e.message === "suspended"
        ? "Your account is suspended."
        : e.message === "banned"
          ? "Your account has been banned. Contact support if you believe this is an error."
          : "You do not have access to this resource.";
    return NextResponse.json(
      { error: "forbidden", message },
      { status: suspended ? 429 : 403, headers },
    );
  }
  if (e instanceof CsrfError) {
    return NextResponse.json(
      { error: "forbidden", message: "Cross-origin request rejected." },
      { status: 403 },
    );
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "bad_request", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  console.error("unhandled route error:", e);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
