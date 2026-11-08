// /login — server wrapper (spec §10.8 / plan Task 9): decides which providers
// are enabled from env and hands the client form its props. force-dynamic so
// the Google button reflects runtime env, not build-time env.
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const githubEnabled = Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );
  return <LoginForm googleEnabled={googleEnabled} githubEnabled={githubEnabled} />;
}
