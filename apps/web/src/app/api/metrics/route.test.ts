// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/metrics", () => {
  it("requires the bearer token when METRICS_TOKEN is set", async () => {
    vi.stubEnv("METRICS_TOKEN", "tok");
    const denied = await GET(new Request("http://localhost/api/metrics") as never);
    expect(denied.status).toBe(401);

    const allowed = await GET(
      new Request("http://localhost/api/metrics", {
        headers: { authorization: "Bearer tok" },
      }) as never,
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("content-type")).toContain("text/plain");
    // Process metrics: the Node runtime is what this endpoint is for.
    expect(await allowed.text()).toContain("process_cpu_user_seconds_total");
  });

  it("compares tokens in constant time and rejects a wrong one", async () => {
    vi.stubEnv("METRICS_TOKEN", "tok");
    const res = await GET(
      new Request("http://localhost/api/metrics", {
        headers: { authorization: "Bearer nope" },
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("fails closed in production when METRICS_TOKEN is unset", async () => {
    vi.stubEnv("METRICS_TOKEN", "");
    vi.stubEnv("NODE_ENV", "production");
    const res = await GET(new Request("http://localhost/api/metrics") as never);
    expect(res.status).toBe(503);
  });

  it("is open in development when METRICS_TOKEN is unset", async () => {
    vi.stubEnv("METRICS_TOKEN", "");
    vi.stubEnv("NODE_ENV", "development");
    const res = await GET(new Request("http://localhost/api/metrics") as never);
    expect(res.status).toBe(200);
  });
});