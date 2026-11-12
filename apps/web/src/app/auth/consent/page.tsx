/* biome-ignore-all lint/performance/noJsxPropsBind: OAuth consent handlers are small and React Compiler optimizes them. */
/* biome-ignore-all lint/complexity/noVoid: Intentional fire-and-forget of UI event promises with in-handler error state. */
"use client";

import { ExternalLink, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { getAuthClient } from "@/lib/studio-auth";
import { getOAuthClient } from "@/lib/studio-oauth";

interface PublicClient {
  client_id: string;
  client_name: string;
  client_uri?: string;
  logo_uri?: string;
  redirect_uris?: string[];
}
interface ConsentDetails {
  client: PublicClient;
  resource: string;
  scope: string;
}

function displayHost(uri: string) {
  try {
    return new URL(uri).host;
  } catch {
    return "Unknown redirect";
  }
}
function isLoopback(uri: string) {
  try {
    const { hostname } = new URL(uri);
    return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
}

export default function ConsentPage() {
  const [details, setDetails] = useState<ConsentDetails | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: independent signed session, client metadata and permission guards
    const load = async () => {
      try {
        const query = new URLSearchParams(window.location.search);
        const { data: session } = await getAuthClient().getSession();
        if (!session?.user) {
          window.location.replace(`/auth/sign-in${window.location.search}`);
          return;
        }
        const clientId = query.get("client_id");
        if (!clientId) {
          setError("The authorization request is missing its client ID.");
          return;
        }
        const result = await getOAuthClient().oauth2.publicClient({
          query: { client_id: clientId },
        });
        if (cancelled) {
          return;
        }
        if (result.error) {
          setError(
            result.error.message ??
              "Could not validate the connecting application."
          );
          return;
        }
        const client = result.data as PublicClient | null;
        if (!(client?.client_id && client.client_name)) {
          setError("Client details are unavailable.");
          return;
        }
        setDetails({
          client,
          resource: query.get("resource") ?? "",
          scope: query.get("scope") ?? "",
        });
      } catch {
        if (!cancelled) {
          setError("The authorization service is not available.");
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const respond = async (accept: boolean) => {
    setPending(true);
    setError("");
    try {
      const result = await getOAuthClient().oauth2.consent({ accept });
      if (result.error) {
        setError(result.error.message ?? "Consent failed. Please retry.");
      }
    } catch {
      setError("The authorization request could not be completed.");
    } finally {
      setPending(false);
    }
  };
  const redirects = details?.client.redirect_uris ?? [];
  const onlyLoopback = redirects.length > 0 && redirects.every(isLoopback);
  return (
    <main className="studio-oauth-page">
      <section className="studio-oauth-card studio-oauth-consent">
        <span className="studio-oauth-icon">
          <ShieldCheck size={25} />
        </span>
        <span className="studio-oauth-eyebrow">
          PROSPECT STUDIO · ACCOUNT AUTHORIZATION
        </span>
        <h1>Allow access to your workspace?</h1>
        {details ? (
          <div className="studio-oauth-details">
            <p>
              <strong>{details.client.client_name}</strong> wants to connect to
              your Prospect Studio account.
            </p>
            {details.client.client_uri ? (
              <p>
                Client site:{" "}
                <a
                  href={details.client.client_uri}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ExternalLink size={13} />{" "}
                  {displayHost(details.client.client_uri)}
                </a>
              </p>
            ) : null}
            <dl>
              <dt>Client ID</dt>
              <dd>{details.client.client_id}</dd>
              <dt>Redirect destinations</dt>
              <dd>
                {redirects.length
                  ? redirects.map(displayHost).join(", ")
                  : "Not provided"}
              </dd>
              <dt>Permissions requested</dt>
              <dd>{details.scope || "Default access"}</dd>
              <dt>Protected service</dt>
              <dd>{details.resource || "Not specified"}</dd>
            </dl>
            {onlyLoopback ? (
              <p className="studio-oauth-warning">
                This application redirects only to localhost. The client name
                alone does not prove its identity.
              </p>
            ) : null}
            <p className="studio-oauth-disclosure">
              The client can run enabled tools under your workspace permissions.
              Private site publication, payments, outreach, and review decisions
              are not authorized by this consent alone.
            </p>
          </div>
        ) : (
          <p>
            Checking the requesting application's identity and permissions...
          </p>
        )}
        {error ? (
          <p className="studio-oauth-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="studio-oauth-actions">
          <button
            disabled={pending || !details}
            onClick={() => void respond(true)}
            type="button"
          >
            Allow access
          </button>
          <button
            className="studio-oauth-reject"
            disabled={pending || !details}
            onClick={() => void respond(false)}
            type="button"
          >
            Deny
          </button>
        </div>
        <small>
          <LockKeyhole size={13} /> You can disconnect this client from your
          auth provider later.
        </small>
      </section>
    </main>
  );
}
