"use client";

// Integrations settings (spec §12.2): the BYOK LLM API key card and the Zotero
// placeholder. The key is write-only — the status endpoint only ever returns
// `{ configured, last4 }`, and the plaintext is cleared from local state the
// moment it is saved.

import { useCallback, useEffect, useState } from "react";
import { Input } from "@spektrum/ui";

interface KeyStatus {
  configured: boolean;
  last4?: string;
}

/**
 * The route answers a refusal with `{ error, message }` — "API key is too
 * short", "must not contain whitespace", "too long", "unauthorized". Showing a
 * single generic sentence instead left the operator with no way to tell a
 * mistyped key from an expired session, so surface the reason.
 */
async function refusalReason(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    if (body.message) return body.message;
    if (body.error === "unauthorized") return "Your session expired — sign in again.";
  } catch {
    // Non-JSON body: fall through to the generic message.
  }
  return fallback;
}

export function IntegrationsSection() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/user/llm-key");
      if (response.ok) setStatus((await response.json()) as KeyStatus);
    } catch {
      // A failed read leaves the card in its "Not configured" state.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (): Promise<void> => {
    const trimmed = key.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/user/llm-key", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      if (!response.ok) {
        setError(await refusalReason(response, "Could not save the key."));
        return;
      }
      setStatus((await response.json()) as KeyStatus);
      setKey("");
    } catch {
      setError("Could not save the key.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/user/llm-key", { method: "DELETE" });
      if (response.ok) {
        setStatus({ configured: false });
        setKey("");
      } else {
        setError(await refusalReason(response, "Could not remove the key."));
      }
    } catch {
      setError("Could not remove the key.");
    } finally {
      setBusy(false);
    }
  };

  const configured = status?.configured ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[color:var(--border-outline)] bg-bg-app px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-base font-normal text-text-editor-primary">
              LLM API key
            </div>
            <div className="text-sm text-text-editor-secondary">
              Bring your own key. It is stored server-side and never returned to the
              browser after saving.
            </div>
          </div>
          <span className="flex-none text-xs text-text-editor-tertiary">
            {configured
              ? `Configured · sk-…${status?.last4 ?? ""}`
              : "Not configured"}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            aria-label="API key"
            type="password"
            autoComplete="off"
            placeholder={configured ? "Replace key" : "sk-…"}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className="h-8 flex-1"
          />
          {configured ? (
            <>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || !key.trim()}
                className="h-8 rounded-lg bg-[color:var(--button-secondary-bg)] px-3 text-sm text-[color:var(--button-secondary-text)] disabled:opacity-50"
              >
                Replace key
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="h-8 rounded-lg border border-[color:var(--border-log)] px-3 text-sm disabled:opacity-50"
              >
                Remove
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !key.trim()}
              className="h-8 rounded-lg bg-[color:var(--button-secondary-bg)] px-3 text-sm text-[color:var(--button-secondary-text)] disabled:opacity-50"
            >
              Add key
            </button>
          )}
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-fg-error">
            {error}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-[color:var(--border-outline)] bg-bg-app px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-base font-normal text-text-editor-primary">Zotero</div>
            <div className="text-sm text-text-editor-secondary">
              With the Zotero integration, you can import your references into your project.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-editor-tertiary">Coming soon</span>
            <button
              type="button"
              aria-disabled="true"
              className="h-8 cursor-not-allowed rounded-lg bg-[color:var(--button-secondary-bg)] px-3 text-sm text-[color:var(--button-secondary-text)] opacity-50"
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}