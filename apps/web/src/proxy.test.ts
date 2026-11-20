// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import proxy from "./proxy";

describe("proxy public paths", () => {
  it("serves the favicon and icon without a session", () => {
    for (const path of ["/favicon.ico", "/icon.svg"]) {
      const response = proxy(new NextRequest(`http://localhost${path}`));
      expect(response.headers.get("location"), path).toBeNull();
    }
  });

  it("still redirects unauthenticated app pages", () => {
    const response = proxy(new NextRequest("http://localhost/u/abc"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});
