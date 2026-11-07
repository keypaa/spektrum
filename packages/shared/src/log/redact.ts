// Log redaction — spec §12.2: LLM keys never reach logs, error reports, or
// SSE payloads. Any value shaped like an API key is masked before logging.
const API_KEY_PATTERN = /sk-[A-Za-z0-9_-]{8,}/g;

export function redactSecrets(text: string): string {
  return text.replace(API_KEY_PATTERN, "sk-***");
}
