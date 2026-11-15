/** AgentMail is server-to-server only: never forward its bearer key to a browser. */
export interface AgentMailThread {
  labels: string[];
  preview: string;
  senders: string[];
  subject: string;
  threadId: string;
  timestamp: string;
}
export interface AgentMailMessage {
  from: string;
  messageId: string;
  subject: string;
  text: string;
  timestamp: string;
}
export interface AgentMailEvent {
  endAt: string;
  eventId: string;
  startAt: string;
  status: string;
  timezone: string;
  title: string;
}
export interface AgentMailEventInput {
  clientId: string;
  end: string;
  prospectId: string;
  start: string;
  timezone: string;
  title: string;
  workspaceId: string;
}
export interface AgentMailClient {
  createEvent: (input: AgentMailEventInput) => Promise<{ eventId: string }>;
  getAgenda: (after: string, before: string) => Promise<AgentMailEvent[]>;
  getThread: (threadId: string) => Promise<AgentMailMessage[]>;
  listThreads: () => Promise<AgentMailThread[]>;
}

interface AgentMailOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  inboxId: string;
}

export function createAgentMailClient({
  apiKey,
  inboxId,
  fetchImpl = fetch,
}: AgentMailOptions): AgentMailClient {
  const root = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}`;
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown
  ): Promise<T> {
    const response = await fetchImpl(`${root}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Never return raw upstream error bodies, which may include sensitive data.
      throw new Error("agentmail_upstream_unavailable");
    }
    return (await response.json()) as T;
  }
  return {
    async createEvent(input) {
      const result = await request<{ event?: { event_id?: string } }>(
        "/calendar/events",
        "POST",
        {
          client_id: input.clientId,
          end: input.end,
          metadata: {
            prospect_id: input.prospectId,
            workspace_id: input.workspaceId,
          },
          send_invites: false,
          start: input.start,
          timezone: input.timezone,
          title: input.title,
        }
      );
      if (!result.event?.event_id) {
        throw new Error("agentmail_invalid_response");
      }
      return { eventId: result.event.event_id };
    },
    async getAgenda(after, before) {
      const params = new URLSearchParams({ after, before, limit: "50" });
      const result = await request<{ events?: Record<string, unknown>[] }>(
        `/calendar/agenda?${params}`
      );
      return (result.events ?? []).map((item) => ({
        endAt: String(item.end_at ?? ""),
        eventId: String(item.event_id ?? ""),
        startAt: String(item.start_at ?? ""),
        status: String(item.status ?? "confirmed"),
        timezone: String(item.timezone ?? "UTC"),
        title: String(item.title ?? "Untitled event").slice(0, 200),
      }));
    },
    async getThread(threadId) {
      const result = await request<{ messages?: Record<string, unknown>[] }>(
        `/threads/${encodeURIComponent(threadId)}?limit=50`
      );
      return (result.messages ?? []).map((item) => ({
        from: String(item.from ?? "Unknown sender").slice(0, 250),
        messageId: String(item.message_id ?? ""),
        subject: String(item.subject ?? "").slice(0, 200),
        text: String(
          item.text ?? item.extracted_text ?? item.preview ?? ""
        ).slice(0, 30_000),
        timestamp: String(item.timestamp ?? ""),
      }));
    },
    async listThreads() {
      const result = await request<{ threads?: Record<string, unknown>[] }>(
        "/threads?limit=50"
      );
      return (result.threads ?? []).map((item) => ({
        labels: Array.isArray(item.labels)
          ? item.labels.filter((v): v is string => typeof v === "string")
          : [],
        preview: String(item.preview ?? "").slice(0, 500),
        senders: Array.isArray(item.senders)
          ? item.senders.filter((v): v is string => typeof v === "string")
          : [],
        subject: String(item.subject ?? "(No subject)").slice(0, 200),
        threadId: String(item.thread_id ?? ""),
        timestamp: String(item.timestamp ?? ""),
      }));
    },
  };
}
