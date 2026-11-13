/* biome-ignore-all lint/performance/noJsxPropsBind: React Compiler handles controlled form event handlers. */
"use client";

import { ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  confirmEmailOtp,
  registerWithEmail,
  resendEmailOtp,
} from "@/lib/email-signup";
import { getAuthClient } from "@/lib/studio-auth";
import { hasAuthorizationQuery, resumeAuthorization } from "@/lib/studio-oauth";

/** Neon Auth signup with mandatory OTP verification when no session is issued. */
export default function OAuthSignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signInUrl, setSignInUrl] = useState("/auth/sign-in");

  useEffect(() => {
    setSignInUrl(`/auth/sign-in${window.location.search}`);
  }, []);

  const finishAuthenticated = async () => {
    if (!hasAuthorizationQuery()) {
      window.location.assign("/");
      return;
    }
    const failure = await resumeAuthorization();
    if (failure) {
      setNotice(
        "Your account is verified, but authorization expired. Retry from the connecting app."
      );
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    try {
      const client = getAuthClient();
      if (needsVerification) {
        const result = await confirmEmailOtp(client, email, code.trim());
        if (result.kind === "error") {
          setError(result.message);
        } else if (result.kind === "authenticated") {
          await finishAuthenticated();
        } else if (result.kind === "verified_sign_in_required") {
          setNeedsVerification(false);
          setNotice(
            "Email verified. Sign in to finish connecting your account."
          );
        }
        return;
      }
      const result = await registerWithEmail(client, { email, name, password });
      if (result.kind === "error") {
        setError(result.message);
      } else if (result.kind === "verify_email") {
        setNeedsVerification(true);
        setNotice("Check your inbox for a verification code.");
      } else if (result.kind === "authenticated") {
        await finishAuthenticated();
      }
    } catch {
      setError("Authentication service temporarily unavailable.");
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    setPending(true);
    setError("");
    try {
      const result = await resendEmailOtp(getAuthClient(), email);
      if (result.ok) {
        setNotice(result.message);
      } else {
        setError(result.message);
      }
    } catch {
      setError("Unable to request a verification code right now.");
    } finally {
      setPending(false);
    }
  };

  let submitLabel = "Create account";
  if (pending) {
    submitLabel = "Working...";
  } else if (needsVerification) {
    submitLabel = "Verify email";
  }
  return (
    <main className="studio-oauth-page">
      <section className="studio-oauth-card">
        <span className="studio-oauth-eyebrow">
          PROSPECT STUDIO · SECURE SIGN-UP
        </span>
        <h1>
          {needsVerification ? "Verify your email" : "Create your account"}
        </h1>
        <p>
          {needsVerification
            ? `Enter the email verification code sent to ${email}.`
            : "Neon Auth manages your credentials. You will still approve any external agent access separately."}
        </p>
        <form onSubmit={submit}>
          {needsVerification ? (
            <label>
              Email verification code
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={8}
                minLength={6}
                onChange={(event) => setCode(event.target.value)}
                required
                type="text"
                value={code}
              />
            </label>
          ) : (
            <>
              <label>
                Display name
                <input
                  autoComplete="name"
                  minLength={2}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label>
                Email
                <input
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label>
                Password
                <input
                  autoComplete="new-password"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
            </>
          )}
          {error ? (
            <p className="studio-oauth-error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="studio-oauth-success" role="status">
              {notice}
            </p>
          ) : null}
          <button disabled={pending} type="submit">
            {submitLabel}
          </button>
          {needsVerification ? (
            <button disabled={pending} onClick={resend} type="button">
              Resend verification code
            </button>
          ) : null}
        </form>
        <a href={signInUrl}>Already registered? Sign in</a>
        <small>
          <ShieldCheck size={14} /> Email verification and session management
          are handled by Neon Auth.
        </small>
      </section>
    </main>
  );
}
