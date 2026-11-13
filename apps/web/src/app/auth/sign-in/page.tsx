/* biome-ignore-all lint/performance/noJsxPropsBind: Input handlers are small and React Compiler optimizes them. */
/* biome-ignore-all lint/complexity/noVoid: OAuth continuation intentionally fires in an effect with a caught promise. */
"use client";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { requiresFreshLogin } from "@/lib/oauth-query";
import { getAuthClient } from "@/lib/studio-auth";
import { hasAuthorizationQuery, resumeAuthorization } from "@/lib/studio-oauth";

export default function OAuthSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [signUpUrl, setSignUpUrl] = useState("/auth/sign-up");
  useEffect(() => {
    setSignUpUrl(`/auth/sign-up${window.location.search}`);
    let stopped = false;
    const resume = async () => {
      if (
        !hasAuthorizationQuery() ||
        requiresFreshLogin(window.location.search)
      ) {
        return;
      }
      const session = await getAuthClient().getSession();
      if (!session.data?.user || stopped) {
        return;
      }
      const message = await resumeAuthorization();
      if (message && !stopped) {
        setError(message);
      }
    };
    void resume().catch(() => {
      if (!stopped) {
        setError("Authentication is temporarily unavailable.");
      }
    });
    return () => {
      stopped = true;
    };
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const { data, error: signInError } = await getAuthClient().signIn.email({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message ?? "Sign-in rejected.");
        return;
      }
      if (data?.redirect) {
        return;
      }
      if (hasAuthorizationQuery()) {
        const issue = await resumeAuthorization();
        if (issue) {
          setError(issue);
        }
      } else {
        router.push("/");
      }
    } catch {
      setError("Authentication service unavailable.");
    } finally {
      setPending(false);
    }
  };
  const signInWithGoogle = async () => {
    setPending(true);
    setError("");
    try {
      const result = await getAuthClient().signIn.social({
        callbackURL: window.location.href,
        provider: "google",
      });
      if (result.error) {
        setError(result.error.message ?? "Google sign-in rejected.");
      }
    } catch {
      setError("Google sign-in is not available.");
    } finally {
      setPending(false);
    }
  };
  return (
    <main className="studio-oauth-page">
      <section className="studio-oauth-card">
        <span className="studio-oauth-icon">
          <LockKeyhole size={24} />
        </span>
        <span className="studio-oauth-eyebrow">
          PROSPECT STUDIO · SECURE CONNECTION
        </span>
        <h1>Sign in to your workspace</h1>
        <p>
          Continue using your existing Neon Auth identity. You will review the
          requesting application's permissions before access is granted.
        </p>
        <form onSubmit={submit}>
          <label>
            Email address
            <input
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? (
            <p className="studio-oauth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button disabled={pending} type="submit">
            {pending ? "Signing in..." : "Continue securely"}
          </button>
        </form>
        <button
          className="studio-oauth-google"
          disabled={pending}
          onClick={signInWithGoogle}
          type="button"
        >
          Continue with Google
        </button>
        {process.env.NEXT_PUBLIC_STAGING_INVITE_ONLY === "1" ? (
          <small>
            Staging access is invite-only. Workspace access is granted
            separately.
          </small>
        ) : (
          <a href={signUpUrl}>Need an account? Create one</a>
        )}
        <small>
          <ShieldCheck size={14} /> Workspace access is checked on every tool
          call.
        </small>
      </section>
    </main>
  );
}
