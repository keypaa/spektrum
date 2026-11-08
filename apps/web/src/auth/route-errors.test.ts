import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";
import { errorResponse } from "./route-errors";
import { UnauthorizedError, ForbiddenError } from "./session";
import { CsrfError } from "@spektrum/shared/http/guard";

describe("errorResponse", () => {
  it("maps UnauthorizedError to 401", async () => {
    const res = errorResponse(new UnauthorizedError());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("maps a permanent ban to 403 with a support message", async () => {
    const res = errorResponse(new ForbiddenError("banned"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/banned/i);
    expect(res.headers.get("retry-after")).toBeNull();
  });

  it("maps a suspension to 429 with Retry-After in seconds", async () => {
    const res = errorResponse(new ForbiddenError("suspended", 90_000));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("90");
  });

  it("maps CsrfError to 403", async () => {
    expect(errorResponse(new CsrfError("nope")).status).toBe(403);
  });

  it("maps ZodError to 400 with issues", async () => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse({ email: "nope" });
    if (parsed.success) throw new Error("expected failure");
    const res = errorResponse(parsed.error as ZodError);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues: unknown[] };
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("maps unknown errors to a generic 500 that leaks nothing", async () => {
    const res = errorResponse(new Error("password hash boom: postgres://u:p@h/db"));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("postgres");
    expect(text).not.toContain("boom");
    expect(JSON.parse(text)).toEqual({ error: "internal_error" });
  });
});
