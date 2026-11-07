import { expect, it } from "vitest";
import { auth } from "./auth";

// Drives Better Auth's handler in-process against Redis-backed rate limiting.
// Each run uses a fresh source IP so runs never share a rate-limit bucket.
const ip = `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

function signInRequest() {
  return new Request("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({
      email: "owner@spektrum.local",
      password: "wrong-password-entirely",
    }),
  });
}

it("locks out after 5 sign-in attempts: 401 x5 then 429 with Retry-After", async () => {
  for (let i = 0; i < 5; i++) {
    const res = await auth.handler(signInRequest());
    expect(res.status, `attempt ${i + 1}`).toBe(401);
    // generic error, no user enumeration
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  }
  const blocked = await auth.handler(signInRequest());
  expect(blocked.status).toBe(429);
  // Better Auth signals the wait via X-Retry-After (seconds); our own app
  // routes set the standard Retry-After header from consume().retryAfterMs.
  const retryAfter =
    blocked.headers.get("x-retry-after") ?? blocked.headers.get("retry-after");
  expect(Number(retryAfter)).toBeGreaterThan(0);
}, 20_000);

it("a different IP is not affected", async () => {
  const other = `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const req = new Request("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-forwarded-for": other,
    },
    body: JSON.stringify({
      email: "owner@spektrum.local",
      password: "wrong-password-entirely",
    }),
  });
  const res = await auth.handler(req);
  expect(res.status).toBe(401); // not 429
}, 20_000);
