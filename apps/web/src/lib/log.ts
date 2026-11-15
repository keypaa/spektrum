// Structured logging (spec §10.6): one JSON object per line on stdout, with
// secrets removed before anything is serialised.
//
// Two layers, because both leak in practice:
//   1. field names — `authorization`, `apiKey`, `llmApiKeyCiphertext`, … are
//      replaced by value, so a secret never reaches the serialiser;
//   2. the serialised line — a backstop for secrets embedded in a message
//      ("upstream said: Bearer sk-…") or in a nested structure under a name
//      that did not look sensitive.
import { redactSecrets } from "@spektrum/shared/log/redact";

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const SENSITIVE_KEY =
  /(authorization|api[-_]?key|access[-_]?key|token|secret|password|passwd|cookie|ciphertext|credential|dsn)/i;

const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const AWS_KEY = /AKIA[0-9A-Z]{16}/g;
const SENTRY_DSN = /https?:\/\/[^\s"']*@[a-z0-9.-]*\.ingest\.sentry\.io[^\s"']*/gi;
const SENTRY_HOST = /[a-z0-9-]+\.ingest\.sentry\.io/gi;

/** Redact secrets that survive field-name redaction. */
export function redactLine(line: string): string {
  return redactSecrets(line)
    .replace(BEARER, "Bearer [redacted]")
    .replace(AWS_KEY, "[redacted]")
    .replace(SENTRY_DSN, "[redacted]")
    .replace(SENTRY_HOST, "[redacted]");
}

function redactValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value !== null && typeof value === "object") {
    return redactFields(value as LogFields);
  }
  return value;
}

function redactFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = redactValue(value, key);
  }
  return out;
}

function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...redactFields(fields),
  });
  process.stdout.write(`${redactLine(line)}\n`);
}

export const log = {
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};