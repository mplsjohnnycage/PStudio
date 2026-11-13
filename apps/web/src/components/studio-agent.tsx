/* biome-ignore-all lint/performance/noJsxPropsBind: Local UI handlers are small and React Compiler optimizes them. */
/* biome-ignore-all lint/complexity/noVoid: Polling and click actions intentionally dispatch async work and handle errors internally. */
"use client";
import {
  Activity,
  ArrowUp,
  Bot,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type View = "map" | "calendar" | "inbox" | "studio";
interface Event {
  createdAt: string;
  id: string;
  prospectId: string | null;
  type: "navigate" | "select_prospect";
  view: View | null;
}
interface Status {
  available: boolean;
  chatgptConnected: boolean;
  reason?: string;
}
interface Message {
  id: string;
  source: "agent" | "operator";
  text: string;
}
interface Props {
  onNavigate: (view: View) => void;
  onRefresh: () => Promise<void>;
  onSelectProspect: (id: string) => void;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  workspaceId: string;
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: operator orchestration and event-poll guards intentionally colocated
export function StudioAgent({
  workspaceId,
  request,
  onNavigate,
  onSelectProspect,
  onRefresh,
}: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [url, setUrl] = useState("");
  const [callback, setCallback] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [movement, setMovement] = useState("");
  const [error, setError] = useState("");
  const cursor = useRef(new Date(Date.now() - 5000).toISOString());
  const seen = useRef(new Set<string>());
  const base = `/workspaces/${encodeURIComponent(workspaceId)}/agent`;
  const check = useCallback(async () => {
    setStatus(await request<Status>(`${base}/status`));
  }, [request, base]);
  useEffect(() => {
    setStatus(null);
    setUrl("");
    setCallback("");
    setMessages([]);
    setMovement("");
    cursor.current = new Date(Date.now() - 5000).toISOString();
    seen.current = new Set();
  }, []);
  useEffect(() => {
    if (open && workspaceId) {
      void check().catch(() => setError("Cannot read agent status."));
    }
  }, [open, workspaceId, check]);
  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    let cancelled = false,
      loading = false;
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: event scope and movement checks intentionally explicit
    const poll = async () => {
      if (loading) {
        return;
      }
      loading = true;
      try {
        const data = await request<{ events: Event[] }>(
          `${base}/events?after=${encodeURIComponent(cursor.current)}`
        );
        if (cancelled) {
          return;
        }
        const fresh = data.events.filter((e) => !seen.current.has(e.id));
        for (const e of fresh) {
          seen.current.add(e.id);
          if (e.type === "navigate" && e.view) {
            onNavigate(e.view);
            setMovement(`Opened ${e.view}`);
          }
          if (e.type === "select_prospect" && e.prospectId) {
            onNavigate("map");
            onSelectProspect(e.prospectId);
            setMovement("Selected a prospect");
          }
        }
        if (fresh.length) {
          await onRefresh();
        }
        const last = data.events.at(-1);
        if (last) {
          cursor.current = new Date(
            new Date(last.createdAt).getTime() - 1000
          ).toISOString();
        }
      } catch {
        /* Retain cursor and retry; no invented success. */
      } finally {
        loading = false;
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), open ? 2500 : 6000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    open,
    workspaceId,
    base,
    request,
    onNavigate,
    onSelectProspect,
    onRefresh,
  ]);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ authorizationUrl: string }>(
        `${base}/chatgpt/start`,
        { method: "POST" }
      );
      setUrl(result.authorizationUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ChatGPT sign-in unavailable.");
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      await request(`${base}/chatgpt/finish`, {
        body: JSON.stringify({ redirectUrl: callback.trim() }),
        method: "POST",
      });
      setUrl("");
      setCallback("");
      await check();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ChatGPT consent failed.");
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = instruction.trim();
    if (!(text && status?.chatgptConnected && !busy)) {
      return;
    }
    setBusy(true);
    setError("");
    setInstruction("");
    setMessages((m) =>
      [
        ...m,
        { id: crypto.randomUUID(), source: "operator" as const, text },
      ].slice(-30)
    );
    try {
      const result = await request<{
        status: "done" | "unanswered";
        text?: string;
        reason?: string;
      }>(`${base}/prompt`, {
        body: JSON.stringify({ requestId: crypto.randomUUID(), text }),
        method: "POST",
      });
      const answer =
        result.status === "done"
          ? (result.text ??
            "Run finished without a text result. Check the dashboard.")
          : `Agent could not complete the request: ${result.reason ?? "unknown error"}`;
      setMessages((m) =>
        [
          ...m,
          { id: crypto.randomUUID(), source: "agent" as const, text: answer },
        ].slice(-30)
      );
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Agent unavailable.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        aria-controls="studio-agent-panel"
        aria-expanded={open}
        className="studio-agent-launch"
        disabled={!workspaceId}
        onClick={() => setOpen((x) => !x)}
        type="button"
      >
        <Sparkles size={17} />
        <span>Agent</span>
        {status?.chatgptConnected ? (
          <span className="studio-agent-online" title="Connected" />
        ) : null}
      </button>
      {open && workspaceId ? (
        <aside
          aria-label="Prospect Operator"
          className="studio-agent-panel"
          id="studio-agent-panel"
        >
          <header className="studio-agent-heading">
            <div className="studio-agent-identity">
              <span className="studio-agent-symbol">
                <Bot size={19} />
              </span>
              <div>
                <strong>Prospect Operator</strong>
                <small>
                  {status?.chatgptConnected
                    ? "Connected · Durable agent"
                    : "Private workspace"}
                </small>
              </div>
            </div>
            <button
              aria-label="Close agent"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X size={18} />
            </button>
          </header>
          {status ? null : (
            <div className="studio-agent-empty">
              <LoaderCircle className="spin" size={20} /> Checking Rivet...
            </div>
          )}
          {status && !status.available ? (
            <div className="studio-agent-setup">
              <LockKeyhole size={29} />
              <h3>Private agent not connected</h3>
              <p>
                Your dashboard works normally. The Rivet runtime and
                authenticated agent broker are not configured for this
                workspace.
              </p>
              <button
                className="studio-btn-secondary"
                onClick={() => void check()}
                type="button"
              >
                <RefreshCcw size={15} /> Check connection
              </button>
              <small>{status.reason ?? "Private runtime unavailable"}</small>
            </div>
          ) : null}
          {status?.available && !status.chatgptConnected ? (
            <div className="studio-agent-setup">
              <ShieldCheck size={28} />
              <h3>Connect a ChatGPT model</h3>
              <p>
                Authorize ChatGPT for this private agent. Neon authentication
                and workspace permissions remain separate.
              </p>
              {url ? (
                <>
                  <a
                    className="studio-agent-consent-link"
                    href={url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Open ChatGPT consent <ExternalLink size={15} />
                  </a>
                  <label className="studio-agent-callback">
                    Paste the callback URL after consent
                    <input
                      autoComplete="off"
                      onChange={(e) => setCallback(e.target.value)}
                      placeholder="http://127.0.0.1:1455/auth/callback?..."
                      spellCheck={false}
                      value={callback}
                    />
                  </label>
                  <button
                    className="studio-btn-primary"
                    disabled={busy || !callback.trim()}
                    onClick={() => void finish()}
                    type="button"
                  >
                    Finish connection
                  </button>
                </>
              ) : (
                <button
                  className="studio-btn-primary"
                  disabled={busy}
                  onClick={() => void start()}
                  type="button"
                >
                  Continue with ChatGPT <ExternalLink size={15} />
                </button>
              )}
              <small>
                Credentials stay inside Rivet, never in the browser.
              </small>
            </div>
          ) : null}
          {status?.chatgptConnected ? (
            <>
              <div className="studio-agent-capabilities">
                <span>
                  <ShieldCheck size={13} /> Scoped tools
                </span>
                <span>
                  <Activity size={13} /> Live dashboard
                </span>
              </div>
              <div aria-live="polite" className="studio-agent-messages">
                {messages.length === 0 ? (
                  <div className="studio-agent-welcome">
                    <Bot size={28} />
                    <h3>What should I work on?</h3>
                    <p>
                      Discover sourced prospects, enrich records, create private
                      website concepts, and navigate the dashboard.
                    </p>
                    <p className="studio-agent-caveat">
                      Publishing, outreach, payments, and review decisions
                      require a human.
                    </p>
                    <div className="studio-agent-examples">
                      {(["Map", "Inbox", "Calendar", "Studio"] as const).map(
                        (page) => (
                          <button
                            key={page}
                            onClick={() =>
                              setInstruction(`Open ${page} in my dashboard`)
                            }
                            type="button"
                          >
                            {page}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      className={`studio-agent-message ${m.source}`}
                      key={m.id}
                    >
                      {m.text}
                    </div>
                  ))
                )}
                {busy ? (
                  <div className="studio-agent-working">
                    <LoaderCircle className="spin" size={15} /> Running tools...
                  </div>
                ) : null}
              </div>
              {movement ? (
                <div className="studio-agent-movement">
                  <Activity size={13} />
                  {movement}
                </div>
              ) : null}
              <form className="studio-agent-compose" onSubmit={submit}>
                <input
                  aria-label="Agent instruction"
                  disabled={busy}
                  maxLength={2500}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Tell the agent what to do..."
                  value={instruction}
                />
                <button
                  aria-label="Run instruction"
                  disabled={busy || !instruction.trim()}
                  type="submit"
                >
                  <ArrowUp size={19} />
                </button>
              </form>
            </>
          ) : null}
          {error ? (
            <div className="studio-agent-error" role="alert">
              {error}
            </div>
          ) : null}
          <footer className="studio-agent-footer">
            <LockKeyhole size={12} /> Workspace protected · Owner approvals
          </footer>
        </aside>
      ) : null}
    </>
  );
}
