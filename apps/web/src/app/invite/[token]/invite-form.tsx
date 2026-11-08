"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/auth/client";

export default function InviteForm({
  token,
  email,
  googleEnabled,
}: {
  token: string;
  email: string;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/invite/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password, name }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? "This invite is no longer valid.");
      return;
    }
    router.push("/login");
  }

  async function onGoogle() {
    setError(null);
    // requestSignUp lets the invite gate admit this one Google sign-up
    // (spec §10.1a); every other path stays closed
    await authClient.signIn.social({
      provider: "google",
      requestSignUp: true,
      callbackURL: "/",
    });
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center"
      style={{ background: "var(--bg-app)" }}
    >
      <div
        className="w-full max-w-[585px] p-8"
        style={{
          background: "var(--modal-bg)",
          borderRadius: "var(--radius-2xl)",
          boxShadow: "var(--shadow-surface)",
        }}
      >
        <h1
          className="text-center text-2xl font-semibold"
          style={{ color: "var(--fg-primary)" }}
        >
          Create account
        </h1>
        <p
          className="mt-2 text-center text-sm"
          style={{ color: "var(--fg-secondary)" }}
        >
          Invited as {email}
        </p>
        {googleEnabled && (
          <button
            type="button"
            onClick={onGoogle}
            className="mt-6 w-full rounded-full py-2.5 text-sm font-medium"
            style={{
              background: "var(--button-primary-bg)",
              color: "var(--button-primary-text)",
            }}
          >
            Continue with Google
          </button>
        )}
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" style={{ color: "var(--fg-secondary)" }} className="text-sm">
              Name
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                background: "var(--input-bg)",
                borderColor: "var(--input-border)",
                color: "var(--fg-primary)",
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" style={{ color: "var(--fg-secondary)" }} className="text-sm">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                background: "var(--input-bg)",
                borderColor: "var(--input-border)",
                color: "var(--fg-primary)",
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm" style={{ color: "var(--fg-secondary)" }} className="text-sm">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                background: "var(--input-bg)",
                borderColor: "var(--input-border)",
                color: "var(--fg-primary)",
              }}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm" style={{ color: "var(--red-500)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-full py-2.5 text-sm font-medium disabled:opacity-60"
            style={{
              background: "var(--button-primary-bg)",
              color: "var(--button-primary-text)",
            }}
          >
            Create account
          </button>
        </form>
      </div>
    </main>
  );
}
