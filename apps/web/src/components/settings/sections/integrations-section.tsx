"use client";

// Integrations settings (spec §12.2): the BYOK LLM API key card and the Zotero
// placeholder. The key is write-only — the status endpoint only ever returns
// `{ configured, last4 }`, and the plaintext is cleared from local state the
// moment it is saved.

import { useCallback, useEffect, useState } from "react";
import { Input } from "@spektrum/ui";
import {
  AI_PROVIDERS,
  CUSTOM_PROVIDER_ID,
  findProvider,
  validateBaseUrl,
  type ImageSupportPreference,
} from "@spektrum/shared/ai";
import { usePreferences } from "@/components/preferences-provider";
import type { ImageSupport } from "@/lib/ai/model-capabilities";
import { SelectRow } from "../select-row";
import { ModelPicker, type ModelOption } from "../model-picker";

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
  const { preferences, setPreference } = usePreferences();
  const llm = preferences.llm;
  const provider =
    findProvider(llm.providerId) ?? findProvider(CUSTOM_PROVIDER_ID)!;
  const baseUrlProblem = llm.baseUrl ? validateBaseUrl(llm.baseUrl) : null;

  const chooseProvider = (id: string): void => {
    const chosen = findProvider(id);
    setPreference("llm", {
      configured: true,
      providerId: id,
      baseUrl: chosen?.baseUrl ?? "",
      chatModel: chosen?.defaultModel ?? "",
      fastModel: chosen?.defaultFastModel ?? "",
      imageSupport: llm.imageSupport,
    });
  };

  const patchLlm = (patch: Partial<typeof llm>): void => {
    setPreference("llm", { ...llm, ...patch, configured: true });
  };

  const [effective, setEffective] = useState<{
    configured: boolean;
    chatModel: string;
    fastModel: string;
  } | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/inference/models")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body?.models) {
          setModels(
            (
              body.models as Array<{
                id: string;
                label?: string;
                imageSupport?: ImageSupport;
              }>
            ).map((model) => ({
              id: model.id,
              label: model.label ?? model.id,
              // Keep the detected signal: the composer's capability resolver
              // consumes the same /models payload.
              imageSupport: model.imageSupport,
            })),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/user/llm-config")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body) setEffective(body as typeof effective);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveEndpoint = llm.baseUrl || provider.baseUrl;
  const localComplete =
    llm.configured && Boolean(llm.chatModel && llm.fastModel && effectiveEndpoint);
  const activeConfigured = localComplete && validateBaseUrl(effectiveEndpoint).ok;
  const activeChatModel = localComplete
    ? llm.chatModel
    : (effective?.chatModel ?? llm.chatModel);
  const activeFastModel = localComplete
    ? llm.fastModel
    : (effective?.fastModel ?? llm.fastModel);

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
              ? `Configured · …${status?.last4 ?? ""}`
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
            <div className="text-base font-normal text-text-editor-primary">
              AI provider &amp; model
            </div>
            <div className="text-sm text-text-editor-secondary">
              Choose the gateway and the models used for chat and thread titles.
            </div>
            <div className="text-xs text-text-editor-tertiary">
              Chat: {activeChatModel} · Titles: {activeFastModel}
            </div>
          </div>
          <span className="flex-none text-xs text-text-editor-tertiary">
            {activeConfigured
              ? `${provider.label} · ${activeChatModel}`
              : `Server default · ${activeChatModel}`}
          </span>
        </div>

        <SelectRow
          label="Provider"
          value={llm.providerId}
          options={AI_PROVIDERS.map((entry) => ({
            value: entry.id,
            label: entry.label,
          }))}
          onChange={chooseProvider}
        />

        <div className="flex flex-col gap-3 pb-1">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="llm-base-url"
              className="text-xs text-text-editor-secondary"
            >
              API endpoint
            </label>
            <Input
              id="llm-base-url"
              aria-label="API endpoint"
              value={llm.baseUrl}
              onChange={(event) => patchLlm({ baseUrl: event.target.value })}
              placeholder={provider.baseUrl || "https://…/v1"}
              className="h-8"
            />
            {baseUrlProblem && !baseUrlProblem.ok ? (
              <p role="alert" className="text-xs text-fg-error">
                {baseUrlProblem.reason}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="text-sm text-text-editor-secondary">Chat model</div>
              <div className="text-xs text-text-editor-tertiary">
                Used for every chat reply.
              </div>
            </div>
            <ModelPicker
              label="Chat model"
              value={llm.chatModel}
              options={models}
              onChange={(value) => patchLlm({ chatModel: value })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="text-sm text-text-editor-secondary">Fast model</div>
              <div className="text-xs text-text-editor-tertiary">
                Used for generated thread titles.
              </div>
            </div>
            <ModelPicker
              label="Fast model"
              value={llm.fastModel}
              options={models}
              onChange={(value) => patchLlm({ fastModel: value })}
            />
          </div>
          <SelectRow
            label="Image input"
            description="Auto detects images from the model metadata. Force on or off overrides detection."
            value={llm.imageSupport}
            options={[
              { value: "auto", label: "Auto" },
              { value: "on", label: "Force on" },
              { value: "off", label: "Force off" },
            ]}
            onChange={(value) =>
              patchLlm({ imageSupport: value as ImageSupportPreference })
            }
          />
        </div>
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