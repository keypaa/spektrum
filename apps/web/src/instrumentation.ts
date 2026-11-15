// Next.js instrumentation (spec §10.6). Sentry is initialised only when a DSN
// is configured; `onRequestError` is registered unconditionally so a handled
// route error is still logged (reportError is a no-op without a DSN).
import { isEnabled, reportError } from "./lib/report-error";

export async function register(): Promise<void> {
  if (!isEnabled()) return;
  const Sentry = await import("@sentry/nextjs");
  const dsn = process.env.SENTRY_DSN;
  Sentry.init({
    ...(dsn ? { dsn } : {}),
    environment: process.env.NODE_ENV ?? "development",
    // Errors, not traces: tracing is opt-in per performance budget.
    tracesSampleRate: 0,
    enabled: true,
  });
}

export const onRequestError = reportError;