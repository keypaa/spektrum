import { describe, expect, it } from "vitest";
import { assertSameOrigin, verifyCsrf, issueCsrfCookie, CSRF_COOKIE_NAME } from "./guard";

const req = (headers: Record<string, string>, method = "POST") =>
  new Request("https://spektrum.app/api/x", { method, headers });

describe("assertSameOrigin", () => {
  it("accepts a matching Origin", () => {
    expect(() =>
      assertSameOrigin(
        req({ origin: "https://spektrum.app" }),
        "https://spektrum.app",
      ),
    ).not.toThrow();
  });

  it("rejects a foreign Origin", () => {
    expect(() =>
      assertSameOrigin(
        req({ origin: "https://evil.example" }),
        "https://spektrum.app",
      ),
    ).toThrow(/origin/i);
  });

  it("rejects a missing Origin on a mutation", () => {
    expect(() =>
      assertSameOrigin(req({}), "https://spektrum.app"),
    ).toThrow(/origin/i);
  });

  it("ignores Origin on GET", () => {
    const get = req({ origin: "https://evil.example" }, "GET");
    expect(() =>
      assertSameOrigin(get, "https://spektrum.app"),
    ).not.toThrow();
  });

  it("normalises case and trailing slash", () => {
    expect(() =>
      assertSameOrigin(
        req({ origin: "HTTPS://SPEKTRUM.APP/" }),
        "https://spektrum.app",
      ),
    ).not.toThrow();
  });
});

describe("verifyCsrf", () => {
  it("accepts matching header and cookie", () => {
    const r = req({ "x-csrf-token": "abc123" });
    expect(verifyCsrf(r, "abc123")).toBe(true);
  });

  it("rejects mismatch, missing header, or missing cookie", () => {
    expect(verifyCsrf(req({ "x-csrf-token": "abc123" }), "different")).toBe(false);
    expect(verifyCsrf(req({}), "abc123")).toBe(false);
    expect(verifyCsrf(req({ "x-csrf-token": "abc123" }), undefined)).toBe(false);
  });
});

describe("issueCsrfCookie", () => {
  it("issues a 43-char token and a matching non-httpOnly cookie", () => {
    const { token, setCookie } = issueCsrfCookie();
    expect(token).toHaveLength(43);
    expect(setCookie).toContain(`${CSRF_COOKIE_NAME}=${token}`);
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).not.toContain("HttpOnly"); // client must read it to echo back
    const again = issueCsrfCookie();
    expect(again.token).not.toBe(token);
  });
});
