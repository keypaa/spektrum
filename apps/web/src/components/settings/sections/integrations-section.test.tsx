// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@spektrum/shared/preferences";
import { PreferencesProvider } from "@/components/preferences-provider";
import { IntegrationsSection } from "./integrations-section";

function renderSection() {
  return render(
    <PreferencesProvider initial={DEFAULT_PREFERENCES}>
      <IntegrationsSection />
    </PreferencesProvider>,
  );
}

const state = vi.hoisted(() => ({
  status: { configured: false } as { configured: boolean; last4?: string },
  config: {
    configured: false,
    providerId: "kilo",
    baseUrl: "https://api.kilocode.ai/v1",
    chatModel: "server-chat",
    fastModel: "server-fast",
  } as {
    configured: boolean;
    providerId: string;
    baseUrl: string;
    chatModel: string;
    fastModel: string;
  },
}));

beforeEach(() => {
  state.status = { configured: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.includes("llm-config")) {
        return new Response(JSON.stringify(state.config), { status: 200 });
      }
      if (url.includes("inference/models")) {
        return new Response(
          JSON.stringify({
            models: [
              { id: "openai/gpt-4o", label: "GPT-4o" },
              { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
            ],
          }),
          { status: 200 },
        );
      }
      if (method === "PUT") {
        state.status = { configured: true, last4: "abcd" };
        return new Response(JSON.stringify(state.status), { status: 200 });
      }
      if (method === "DELETE") {
        state.status = { configured: false };
        return new Response(JSON.stringify({ configured: false }), { status: 200 });
      }
      return new Response(JSON.stringify(state.status), { status: 200 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IntegrationsSection — LLM API key", () => {
  it("shows Not configured and Add key with no key", async () => {
    renderSection();
    expect(await screen.findByText("Not configured")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add key" })).toBeTruthy();
  });

  it("saves a key, shows Configured with the last 4, and clears the input", async () => {
    renderSection();
    await screen.findByText("Not configured");
    const input = screen.getByLabelText("API key");
    await userEvent.type(input, "sk-secret-1234");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));

    await waitFor(() => expect(screen.getByText(/Configured/)).toBeTruthy());
    expect(screen.getByText(/abcd/)).toBeTruthy();
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
    const put = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls.find((call) => (call[1] as RequestInit | undefined)?.method === "PUT");
    expect(JSON.parse(String((put![1] as RequestInit).body))).toEqual({
      apiKey: "sk-secret-1234",
    });
  });

  it("removes the key and returns to Not configured", async () => {
    renderSection();
    await screen.findByText("Not configured");
    await userEvent.type(screen.getByLabelText("API key"), "sk-secret-1234");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    await screen.findByText(/Configured/);

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Not configured")).toBeTruthy();
    const del = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls.find((call) => (call[1] as RequestInit | undefined)?.method === "DELETE");
    expect(del).toBeTruthy();
  });

  it("never renders the plaintext key", async () => {
    renderSection();
    await screen.findByText("Not configured");
    await userEvent.type(screen.getByLabelText("API key"), "sk-plaintext-key-9999");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    await screen.findByText(/Configured/);
    expect(screen.queryByText(/sk-plaintext-key-9999/)).toBeNull();
    expect(document.body.textContent).not.toContain("sk-plaintext-key-9999");
  });

  // The route explains rejections; a single "Could not save the key." hid
  // whether the key was malformed or the session had gone.
  it("shows the server's reason when the key is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        (init?.method ?? "GET") === "PUT"
          ? new Response(
              JSON.stringify({
                error: "bad_request",
                message: "API key must not contain whitespace",
              }),
              { status: 400 },
            )
          : new Response(JSON.stringify({ configured: false }), { status: 200 }),
      ),
    );
    renderSection();
    await screen.findByText("Not configured");
    await userEvent.type(screen.getByLabelText("API key"), "sk-secret-1234");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(await screen.findByText("API key must not contain whitespace")).toBeTruthy();
  });

  it("explains an expired session instead of a generic failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        (init?.method ?? "GET") === "PUT"
          ? new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
          : new Response(JSON.stringify({ configured: false }), { status: 200 }),
      ),
    );
    renderSection();
    await screen.findByText("Not configured");
    await userEvent.type(screen.getByLabelText("API key"), "sk-secret-1234");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(await screen.findByText("Your session expired — sign in again.")).toBeTruthy();
  });
});

describe("IntegrationsSection — AI provider and model", () => {
  it("shows the active provider/model and pre-fills a chosen provider", async () => {
    renderSection();
    expect(await screen.findByText(/Server default · server-chat/)).toBeTruthy();
    expect(screen.getByText(/Titles: server-fast/)).toBeTruthy();
    expect(screen.getByLabelText("Provider")).toBeTruthy();

    await userEvent.selectOptions(screen.getByLabelText("Provider"), "openrouter");
    expect((screen.getByLabelText("API endpoint") as HTMLInputElement).value).toBe(
      "https://openrouter.ai/api/v1",
    );
    expect(screen.getByRole("button", { name: "Chat model" }).textContent).toContain(
      "openai/gpt-4o",
    );
    expect(screen.getByText(/OpenRouter · openai\/gpt-4o/)).toBeTruthy();
  });

  it("accepts a custom endpoint and model names", async () => {
    renderSection();
    await userEvent.selectOptions(screen.getByLabelText("Provider"), "custom");
    await userEvent.type(
      screen.getByLabelText("API endpoint"),
      "http://localhost:1234/v1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Chat model" }));
    await userEvent.type(screen.getByLabelText("Search Chat model"), "local-model");
    await userEvent.click(screen.getByRole("option", { name: /Use "local-model"/ }));
    await userEvent.click(screen.getByRole("button", { name: "Fast model" }));
    await userEvent.type(screen.getByLabelText("Search Fast model"), "local-fast");
    await userEvent.click(screen.getByRole("option", { name: /Use "local-fast"/ }));
    expect(screen.getByText(/Custom endpoint · local-model/)).toBeTruthy();
  });

  it("persists the Auto/Force on/Force off image input override", async () => {
    renderSection();
    const select = (await screen.findByLabelText("Image input")) as HTMLSelectElement;
    expect(select.value).toBe("auto");

    await userEvent.selectOptions(select, "off");

    await waitFor(() => {
      const put = (
        globalThis.fetch as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls.find(
        (call) => (call[1] as RequestInit | undefined)?.method === "PUT",
      );
      expect(put).toBeTruthy();
      expect(
        JSON.parse(String((put![1] as RequestInit).body)).llm.imageSupport,
      ).toBe("off");
    });
  });
});