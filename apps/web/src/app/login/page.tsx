"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/auth/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.signIn.email({
      email,
      password,
      callbackURL: searchParams.get("from") ?? "/",
    });
    setLoading(false);
    if (err) {
      // no user enumeration: same message for any credential failure
      setError("Incorrect email or password.");
      return;
    }
    router.push(searchParams.get("from") ?? "/");
    router.refresh();
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center"
      style={{ background: "var(--bg-app)" }}
    >
      <div
        className="w-full max-w-[585px] rounded-2xl p-8 shadow-2xl"
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
          Sign in
        </h1>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-sm"
              style={{ color: "var(--fg-secondary)" }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--input-bg)",
                borderColor: "var(--input-border)",
                color: "var(--fg-primary)",
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-sm"
              style={{ color: "var(--fg-secondary)" }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
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
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
