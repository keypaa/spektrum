// Next 16 request gate — named proxy.ts, NOT middleware.ts (spec §3.5).
// Fast path only: checks the Better Auth session cookie is present.
// The real check (requireUser, including ban state) runs in the route/RSC,
// because only there can we read the DB session and revoke on ban.
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/api/auth",
  "/api/health",
  "/sign-in",
  "/_next",
  "/fonts",
  "/favicon.ico",
];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const sessionCookie = request.cookies.get(
    "better-auth.session_token",
  )?.value;
  if (!sessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|api/health|sign-in|_next|fonts|favicon.ico).*)"],
};
