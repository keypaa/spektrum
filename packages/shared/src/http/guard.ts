// Same-origin + CSRF guards for OUR mutating routes (spec §10.6).
// Better Auth validates Origin on /api/auth/* itself; this guard is only for
// our own /api/* mutation routes — never wrap /api/auth/*.
import { randomBytes, timingSafeEqual } from "node:crypto";

export class CsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsrfError";
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normaliseOrigin(origin: string): string {
  try {
    return new URL(origin).origin; // lowercases host, strips path/trailing slash
  } catch {
    return origin.toLowerCase().replace(/\/+$/, "");
  }
}

export function assertSameOrigin(req: Request, expectedOrigin: string): void {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) {
    throw new CsrfError("missing Origin header on a state-changing request");
  }
  if (normaliseOrigin(origin) !== normaliseOrigin(expectedOrigin)) {
    throw new CsrfError(`Origin ${origin} does not match ${expectedOrigin}`);
  }
}

export function verifyCsrf(req: Request, cookieToken?: string): boolean {
  const headerToken = req.headers.get("x-csrf-token");
  if (!headerToken || !cookieToken) return false;
  const a = Buffer.from(headerToken);
  const b = Buffer.from(cookieToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Double-submit pair (spec §10.3): the cookie is NOT httpOnly so the client can
// echo it in the x-csrf-token header; the server compares both in constant time.
// Our routes currently rely on assertSameOrigin (browsers cannot forge Origin
// cross-site) plus SameSite=Lax; this pair is the fallback for non-browser
// clients that cannot send Origin.
export const CSRF_COOKIE_NAME = "spektrum.csrf";

export function issueCsrfCookie(): { token: string; setCookie: string } {
  const token = randomBytes(32).toString("base64url");
  const setCookie = `${CSRF_COOKIE_NAME}=${token}; Path=/; SameSite=Strict; Secure`;
  return { token, setCookie };
}
