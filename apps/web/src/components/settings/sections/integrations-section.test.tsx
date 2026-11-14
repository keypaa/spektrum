// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationsSection } from "./integrations-section";

const state = vi.hoisted(() => ({
  status: { configured: false } as { configured: boolean; last4?: string },
}));

beforeEach(() => {
  state.status = { configured: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
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
    render(<IntegrationsSection />);
    expect(await screen.findByText("Not configured")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add key" })).toBeTruthy();
  });

  it("saves a key, shows Configured with the last 4, and clears the input", async () => {
    render(<IntegrationsSection />);
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
    render(<IntegrationsSection />);
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
    render(<IntegrationsSection />);
    await screen.findByText("Not configured");
    await userEvent.type(screen.getByLabelText("API key"), "sk-plaintext-key-9999");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    await screen.findByText(/Configured/);
    expect(screen.queryByText(/sk-plaintext-key-9999/)).toBeNull();
    expect(document.body.textContent).not.toContain("sk-plaintext-key-9999");
  });
});