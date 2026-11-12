/* biome-ignore-all lint/performance/noJsxPropsBind: React Compiler handles these controlled field event handlers. */
"use client";

import { ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { getAuthClient } from "@/lib/studio-auth";
import { hasAuthorizationQuery, resumeAuthorization } from "@/lib/studio-oauth";

/** Account creation for MCP OAuth only: consent is always a separate step. */
export default function OAuthSignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signInUrl, setSignInUrl] = useState("/auth/sign-in");
  useEffect(() => {
    setSignInUrl(`/auth/sign-in${window.location.search}`);
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await getAuthClient().signUp.email({
        email,
        name,
        password,
      });
      if (result.error) {
        setError(result.error.message ?? "Registration failed.");
        return;
      }
      if (hasAuthorizationQuery()) {
        const failure = await resumeAuthorization();
        if (failure) {
          setNotice(
            "Your account was created, but this authorization expired. Retry from the connecting app."
          );
        }
      } else {
        window.location.assign("/");
      }
    } catch {
      setError("Authentication service temporarily unavailable.");
    } finally {
      setPending(false);
    }
  };
  return (
    <main className="studio-oauth-page">
      <section className="studio-oauth-card">
        <span className="studio-oauth-eyebrow">
          PROSPECT STUDIO · SECURE SIGN-UP
        </span>
        <h1>Create your account</h1>
        <p>
          An account does not automatically authorize external agents. You will
          still review client access and workspace permissions.
        </p>
        <form onSubmit={submit}>
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
            {pending ? "Creating..." : "Create account"}
          </button>
        </form>
        <a href={signInUrl}>Already registered? Sign in</a>
        <small>
          <ShieldCheck size={14} /> Neon Auth manages account credentials and
          workspace access.
        </small>
      </section>
    </main>
  );
}
