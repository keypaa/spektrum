// /invite/[token] — server wrapper (plan Tasks 11/13): the token is validated
// SERVER-SIDE before any form is rendered; the bound email is shown; the
// client form receives only { token, email, googleEnabled }.
import { getInviteStatus } from "@/auth/invites";
import InviteForm from "./invite-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const status = await getInviteStatus(token);
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  if (!status.ok) {
    const message =
      status.reason === "revoked"
        ? "This invite has been revoked."
        : status.reason === "used"
          ? "This invite has already been used."
          : status.reason === "expired"
            ? "This invite has expired."
            : "This invite is no longer valid.";
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
          <p className="mt-4 text-center text-sm" style={{ color: "var(--red-500)" }}>
            {message}
          </p>
        </div>
      </main>
    );
  }
  return (
    <InviteForm token={token} email={status.email} googleEnabled={googleEnabled} />
  );
}
