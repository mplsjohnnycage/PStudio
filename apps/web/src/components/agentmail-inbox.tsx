"use client";
import { Inbox, RefreshCcw, Shield } from "lucide-react";
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
interface Thread {
  labels: string[];
  preview: string;
  senders: string[];
  subject: string;
  threadId: string;
  timestamp: string;
}
interface Message {
  from: string;
  messageId: string;
  text: string;
  timestamp: string;
}
interface Props {
  request: Request;
  workspaceId: string;
}
const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-US", {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        timeZone: "America/Chicago",
      });
};
function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("integration_not_configured")) {
    return "AgentMail needs a dedicated inbox, a server-side API key, and an assigned PStudio workspace. Existing personal mailboxes are not accessed.";
  }
  if (message.includes("not_found") || message.includes("unauthorized")) {
    return "This account cannot access the PStudio mailbox.";
  }
  return "AgentMail is unavailable. Retry after checking the connection.";
}

export function AgentMailInbox({ request, workspaceId }: Props) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const listEpoch = useRef(0);
  const threadEpoch = useRef(0);
  const reload = useCallback(async () => {
    listEpoch.current += 1;
    const { current } = listEpoch;
    setLoading(true);
    setError("");
    try {
      const data = await request<{ threads: Thread[] }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/agentmail/threads`
      );
      if (current === listEpoch.current) {
        setThreads(data.threads);
      }
    } catch (cause) {
      if (current === listEpoch.current) {
        setThreads([]);
        setError(errorText(cause));
      }
    } finally {
      if (current === listEpoch.current) {
        setLoading(false);
      }
    }
  }, [request, workspaceId]);
  useEffect(() => {
    threadEpoch.current += 1;
    setSelected("");
    setMessages([]);
    setThreadLoading(false);
    reload();
    return () => {
      listEpoch.current += 1;
      threadEpoch.current += 1;
    };
  }, [reload]);
  const visible = useMemo(
    () =>
      threads.filter((thread) =>
        `${thread.subject} ${thread.senders.join(" ")} ${thread.preview}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [threads, search]
  );
  const active = threads.find((thread) => thread.threadId === selected);
  const open = useCallback(
    async (thread: Thread) => {
      threadEpoch.current += 1;
      const { current } = threadEpoch;
      setSelected(thread.threadId);
      setMessages([]);
      setError("");
      setThreadLoading(true);
      try {
        const data = await request<{ messages: Message[] }>(
          `/workspaces/${encodeURIComponent(workspaceId)}/agentmail/threads/${encodeURIComponent(thread.threadId)}`
        );
        if (current === threadEpoch.current) {
          setMessages(data.messages);
        }
      } catch (cause) {
        if (current === threadEpoch.current) {
          setError(errorText(cause));
        }
      } finally {
        if (current === threadEpoch.current) {
          setThreadLoading(false);
        }
      }
    },
    [request, workspaceId]
  );
  const handleSearch = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  }, []);
  const handleThreadClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const thread = threads.find(
        (row) => row.threadId === event.currentTarget.dataset.threadId
      );
      if (thread) {
        open(thread);
      }
    },
    [threads, open]
  );
  return (
    <section aria-label="AgentMail inbox" className="pstudio-communications">
      <header className="pstudio-comm-heading">
        <div>
          <span className="studio-eyebrow">
            AGENTMAIL · CONNECTED COMMUNICATIONS
          </span>
          <h1>Inbox</h1>
          <p>Real email threads, not simulated prospect conversations.</p>
        </div>
        <button className="studio-btn-secondary" onClick={reload} type="button">
          <RefreshCcw size={15} /> Refresh
        </button>
      </header>
      <div className="pstudio-comm-counts">
        <div>
          <strong>
            {
              threads.filter((thread) => thread.labels.includes("unread"))
                .length
            }
          </strong>
          Unread
        </div>
        <div>
          <strong>{threads.length}</strong>Threads
        </div>
        <div>
          <strong>0</strong>Automatic sends
        </div>
      </div>
      {error ? (
        <p aria-live="polite" className="pstudio-comm-error">
          {error}
        </p>
      ) : null}
      <div className="pstudio-comm-grid">
        <aside className="pstudio-comm-list">
          <input
            aria-label="Search email threads"
            onChange={handleSearch}
            placeholder="Search threads"
            value={search}
          />
          {loading ? (
            <p className="pstudio-comm-muted">Loading email threads…</p>
          ) : null}
          {!loading && visible.length === 0 ? (
            <p className="pstudio-comm-muted">
              {error ? "Inbox not connected" : "No threads found."}
            </p>
          ) : null}
          {visible.map((thread) => (
            <button
              aria-pressed={selected === thread.threadId}
              className={selected === thread.threadId ? "selected" : ""}
              data-thread-id={thread.threadId}
              key={thread.threadId}
              onClick={handleThreadClick}
              type="button"
            >
              <strong>{thread.subject}</strong>
              <small>{thread.senders.join(", ")}</small>
              <span>{thread.preview}</span>
              <small>
                {formatTime(thread.timestamp)}
                {thread.labels.includes("unread") ? " · Unread" : ""}
              </small>
            </button>
          ))}
        </aside>
        <article className="pstudio-comm-detail">
          {active ? (
            <>
              <h2>{active.subject}</h2>
              {threadLoading ? (
                <p className="pstudio-comm-muted">Loading conversation…</p>
              ) : null}
              {messages.map((message) => (
                <div className="pstudio-comm-message" key={message.messageId}>
                  <div>
                    <strong>{message.from}</strong>
                    <small>{formatTime(message.timestamp)}</small>
                  </div>
                  <p>{message.text}</p>
                </div>
              ))}
              <p className="pstudio-comm-muted">
                <Shield size={15} /> Reply sending requires a separate approved
                workflow.
              </p>
            </>
          ) : (
            <div className="pstudio-comm-empty">
              <Inbox size={35} />
              <h2>Select a conversation</h2>
              <p>
                Messages are read from AgentMail once selected. No email is
                sent.
              </p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
