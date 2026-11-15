// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentry.captureException,
  init: vi.fn(),
}));

beforeEach(() => {
  sentry.captureException.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reportError", () => {
  it("is a no-op when SENTRY_DSN is unset", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const { reportError } = await import("./report-error");
    await expect(
      reportError(new Error("boom"), { route: "/api/import" }),
    ).resolves.toBeUndefined();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports the error when a DSN is configured and never throws", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");
    const { reportError } = await import("./report-error");
    sentry.captureException.mockImplementation(() => {
      throw new Error("sentry down");
    });
    await expect(
      reportError(new Error("boom"), { route: "/api/import" }),
    ).resolves.toBeUndefined();
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });
});