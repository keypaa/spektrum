// Next 16 request gate — named proxy.ts, NOT middleware.ts (spec §3.5).
// Fast path only: checks the Better Auth session cookie is present.
// The real check (requireUser, including ban state) runs in the route/RSC,
// because only there can we read the DB session and revoke on ban.
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/api/auth",
  "/api/health",
  // Guarded by METRICS_TOKEN inside the route (fails closed in production).
  "/api/metrics",
  "/login",
  "/invite",
  "/_next",
  "/fonts",
  "/favicon.ico",
];

// Better Auth prefixes cookies with __Secure- when the base URL is https
// (production), so both names must be accepted.
const SESSION_COOKIE_NAMES = [
  "__Secure-better-auth.session_token",
  "better-auth.session_token",
];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const sessionCookie = SESSION_COOKIE_NAMES.map(
    (name) => request.cookies.get(name)?.value,
  ).find(Boolean);
  if (!sessionCookie) {
    // API consumers get a real 401, browsers get the login redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|api/health|api/metrics|login|invite|_next|fonts|favicon.ico).*)"],
};
