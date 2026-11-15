// Optional error reporting (spec §10.6). With no SENTRY_DSN this is a no-op, so
// a self-hosted deployment never phones home.
//
// `@sentry/nextjs` is imported lazily: importing it at module load would make
// the dependency mandatory for every build, and the whole point is that it is
// optional.
import { loadWebEnv } from "@spektrum/shared/env";

export type ErrorContext = {
  route?: string;
  method?: string;
  userId?: string;
  [key: string]: unknown;
};

/** True when a DSN is configured. */
export function isEnabled(): boolean {
  try {
    return Boolean(loadWebEnv().sentryDsn);
  } catch {
    return false;
  }
}

export async function reportError(
  error: unknown,
  context: ErrorContext = {},
): Promise<void> {
  if (!isEnabled()) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error, {
      extra: context,
      ...(context.route ? { tags: { route: context.route } } : {}),
    });
  } catch {
    // Reporting must never turn a handled error into an unhandled one.
  }
}