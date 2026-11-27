"use client";
import {
  buildCentralCalendarHold,
  centralToday,
} from "@prospect-studio/api/calendar-time";
import { CalendarDays, Clock3, RefreshCcw, Shield } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createLatestRequestGate } from "../lib/latest-request-gate";

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
interface CalendarEvent {
  endAt: string;
  eventId: string;
  startAt: string;
  status: string;
  timezone: string;
  title: string;
}
interface ProspectOption {
  id: string;
  name: string;
}
interface Props {
  prospects: ProspectOption[];
  request: Request;
  workspaceId: string;
}
const TZ = "America/Chicago";
const fmt = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: TZ,
  });
export function AgentMailCalendar({ request, workspaceId, prospects }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const pendingClientId = useRef<string | null>(null);
  const agendaGate = useRef(createLatestRequestGate());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [prospectId, setProspectId] = useState("");
  const [date, setDate] = useState(() => centralToday());
  const [time, setTime] = useState("10:00");
  const [minutes, setMinutes] = useState(30);
  const load = useCallback(async () => {
    const isCurrent = agendaGate.current.begin();
    setLoading(true);
    setError("");
    const after = new Date();
    after.setDate(after.getDate() - 7);
    const before = new Date();
    before.setDate(before.getDate() + 60);
    try {
      const data = await request<{ events: CalendarEvent[] }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/agentmail/agenda?after=${encodeURIComponent(after.toISOString())}&before=${encodeURIComponent(before.toISOString())}`
      );
      if (isCurrent()) {
        setEvents(data.events);
      }
    } catch (cause) {
      if (!isCurrent()) {
        return;
      }
      setEvents([]);
      setError(
        cause instanceof Error &&
          cause.message.includes("integration_not_configured")
          ? "AgentMail Calendar is not assigned to this workspace. Configure a dedicated inbox and server credentials."
          : "AgentMail Calendar could not be loaded."
      );
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, [request, workspaceId]);
  useEffect(() => {
    const gate = agendaGate.current;
    load();
    return () => gate.invalidate();
  }, [load]);
  const schedule = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy || !prospectId || !date || !time) {
        return;
      }
      let start: string;
      let end: string;
      try {
        ({ start, end } = buildCentralCalendarHold(date, time, minutes));
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Choose a valid Central date and time."
        );
        return;
      }
      const name =
        prospects.find((prospect) => prospect.id === prospectId)?.name ??
        "Business";
      const clientId = pendingClientId.current ?? crypto.randomUUID();
      pendingClientId.current = clientId;
      setBusy(true);
      setNotice("");
      try {
        await request(
          `/workspaces/${encodeURIComponent(workspaceId)}/agentmail/events`,
          {
            body: JSON.stringify({
              clientId,
              end,
              prospectId,
              start,
              timezone: TZ,
              title: `Prospect call · ${name}`,
            }),
            method: "POST",
          }
        );
        pendingClientId.current = null;
        setNotice(
          "Internal AgentMail calendar hold created. No invitation was sent."
        );
        await load();
      } catch {
        setError("Unable to create calendar hold. Check access and dates.");
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      prospectId,
      date,
      time,
      minutes,
      prospects,
      request,
      workspaceId,
      load,
    ]
  );
  const handleProspect = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      pendingClientId.current = null;
      setError("");
      setProspectId(event.target.value);
    },
    []
  );
  const handleDate = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    pendingClientId.current = null;
    setError("");
    setDate(event.target.value);
  }, []);
  const handleTime = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    pendingClientId.current = null;
    setError("");
    setTime(event.target.value);
  }, []);
  const handleDuration = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      pendingClientId.current = null;
      setError("");
      setMinutes(Number(event.target.value));
    },
    []
  );
  return (
    <section aria-label="AgentMail calendar" className="pstudio-communications">
      <header className="pstudio-comm-heading">
        <div>
          <span className="studio-eyebrow">
            AGENTMAIL CALENDAR · AMERICA/CHICAGO
          </span>
          <h1>Calendar</h1>
          <p>Real workspace events and prospect calls.</p>
        </div>
        <button className="studio-btn-secondary" onClick={load} type="button">
          <RefreshCcw size={15} /> Refresh
        </button>
      </header>
      {error ? (
        <p className="pstudio-comm-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="pstudio-comm-success" role="status">
          {notice}
        </p>
      ) : null}
      <div className="pstudio-comm-calendar">
        <div className="pstudio-comm-agenda">
          <h2>
            <CalendarDays size={19} /> Upcoming events
          </h2>
          {loading ? (
            <p className="pstudio-comm-muted">Loading calendar…</p>
          ) : null}
          {!loading && events.length === 0 ? (
            <p className="pstudio-comm-muted">
              {error
                ? "Calendar not connected"
                : "No upcoming events. Incoming calendar invitations will appear here."}
            </p>
          ) : null}
          {events.map((item) => (
            <div className="pstudio-comm-event" key={item.eventId}>
              <span>{fmt(item.startAt)}</span>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.status} · {item.timezone}
                </small>
              </div>
            </div>
          ))}
        </div>
        <form className="pstudio-comm-plan" onSubmit={schedule}>
          <span className="studio-eyebrow">PLAN A PHONE CALL</span>
          <h2>Create internal hold</h2>
          <p>
            Saved on AgentMail Calendar. Invitations are never sent
            automatically.
          </p>
          <label>
            Prospect
            <select onChange={handleProspect} required value={prospectId}>
              <option value="">Select a prospect</option>
              {prospects.map((prospect) => (
                <option key={prospect.id} value={prospect.id}>
                  {prospect.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input onChange={handleDate} required type="date" value={date} />
          </label>
          <label>
            Time · Central
            <input onChange={handleTime} required type="time" value={time} />
          </label>
          <label>
            Duration
            <select onChange={handleDuration} value={minutes}>
              {[15, 30, 45, 60].map((item) => (
                <option key={item} value={item}>
                  {item} minutes
                </option>
              ))}
            </select>
          </label>
          <button
            className="studio-btn-primary"
            disabled={busy || !prospectId}
            type="submit"
          >
            <Clock3 size={16} />
            {busy ? "Saving…" : "Plan call (no invitation)"}
          </button>
          <small>
            <Shield size={14} /> External invitations require explicit approval.
          </small>
        </form>
      </div>
    </section>
  );
}
