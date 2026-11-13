"use client";

import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Database,
  ExternalLink,
  Eye,
  FilePlus2,
  Globe2,
  Inbox,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MapPin,
  Monitor,
  PanelsTopLeft,
  Plus,
  RefreshCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authConfigured, getApiToken, getAuthClient } from "@/lib/studio-auth";
import { StudioAgent } from "./studio-agent";
import { StudioMap } from "./studio-map";

interface Workspace {
  id: string;
  name: string;
  role: string;
}
interface Prospect {
  hasExternalSource: boolean;
  id: string;
  name: string;
  physicalAddress: string | null;
  stage: string;
  websiteStatus: string;
  websiteUrl: string | null;
}
interface EvidenceFeed {
  claims: {
    field: string;
    id: string;
    kind: string;
    observedAt: string;
    value: string | null;
  }[];
  evidence: {
    capturedAt: string;
    id: string;
    sha256: string;
    sourceUri: string;
    title: string;
    type: string;
  }[];
}
interface Job {
  attempt: number;
  id: string;
  prospectId: string;
  state: string;
  type: string;
}
interface Preview {
  html: string;
  previewId: string;
  releaseId: string;
  version: number;
}
interface PreviewVersion {
  previewId: string;
  releaseId: string;
  sha256: string;
  state: string;
  version: number;
}
interface Review {
  approvalId: string;
  decidedBy: string | null;
  previewId: string;
  releaseId: string;
  state: string;
}

const serverConfigured = Boolean(process.env.NEXT_PUBLIC_SERVER_URL);
const apiOrigin = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "") ?? "";

async function studioApi<T>(path: string, options?: RequestInit): Promise<T> {
  if (!serverConfigured) {
    throw new Error(
      "Configure NEXT_PUBLIC_SERVER_URL to connect to the Prospect Studio API."
    );
  }
  const token = await getApiToken();
  if (!token) {
    throw new Error(
      "Your session is missing a valid API token. Sign in again."
    );
  }
  const response = await fetch(`${apiOrigin}/v1${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const value = await response.json();
  if (!response.ok) {
    const code = (value as { error?: string }).error ?? "request_failed";
    throw new Error(
      code === "selection_required"
        ? `Multiple historical matches. Select a license ID and retry: ${JSON.stringify((value as { matches?: unknown }).matches ?? [])}`
        : code === "not_found"
          ? "Not found, or this workspace is not accessible."
          : code === "unauthorized"
            ? "Your session has expired or is not authorized."
            : code === "temporarily_unavailable"
              ? "The service is unavailable. Check the server and database connection."
              : code === "limit_reached"
                ? "Workspace limit reached."
                : code === "invalid_input"
                  ? "Review your inputs and try again."
                  : code
    );
  }
  return value as T;
}

function Login({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authConfigured) {
      setError("Neon Auth is not configured for this deployment.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const client = getAuthClient();
      const response = await client.signIn.email({ email, password });
      if (response.error) {
        setError(response.error.message ?? "Authentication was rejected.");
        return;
      }
      const session = await client.getSession();
      if (!session.data?.user) {
        setError("Complete email verification, then sign in again.");
        return;
      }
      await onAuthenticated();
    } catch {
      setError("Authentication service is unreachable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="studio-auth-page">
      <div className="studio-auth-visual">
        <div className="studio-brand">
          <div className="studio-brand-mark">
            P<span>.</span>
          </div>
          PROSPECT <b>STUDIO</b>
        </div>
        <div className="studio-auth-story">
          <span className="studio-eyebrow">
            <span className="studio-live-dot" /> THE PROSPECT WORKSPACE
          </span>
          <h1>
            Find the opportunity.
            <br />
            <em>Build the proof.</em>
          </h1>
          <p>
            A private operating system for turning verified business
            intelligence into compelling website concepts.
          </p>
        </div>
        <div className="studio-auth-foot">
          <span>DISCOVER</span>
          <ArrowRight size={14} />
          <span>ENRICH</span>
          <ArrowRight size={14} />
          <span>CREATE</span>
          <ArrowRight size={14} />
          <span>REVIEW</span>
        </div>
      </div>
      <div className="studio-auth-form-area">
        <form className="studio-auth-card" onSubmit={submit}>
          <div className="studio-auth-icon">
            <LockKeyhole size={23} />
          </div>
          <p className="studio-eyebrow">SECURE WORKSPACE</p>
          <h2>Welcome back</h2>
          <p className="studio-auth-caption">
            Sign in with your verified Neon Auth identity. Workspace permissions
            are checked for every request.
          </p>
          <label>
            Email address
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? (
            <p className="studio-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="studio-btn-primary"
            disabled={busy || !authConfigured}
            type="submit"
          >
            {busy ? <LoaderCircle className="spin" size={17} /> : null}
            Sign in to Studio
            <ArrowRight size={17} />
          </button>
          <a className="studio-auth-switch" href="/auth/sign-up">
            Need access? Create an account
          </a>
          <div className="studio-auth-note">
            <Shield size={15} />{" "}
            {authConfigured
              ? "Credentials are handled by Neon Auth."
              : "Neon authentication must be configured by the operator."}
          </div>
        </form>
      </div>
    </main>
  );
}

export function StudioApp() {
  const [session, setSession] = useState<{
    user: { id: string; email?: string };
  } | null>(null);
  const [isPending, setIsPending] = useState(true);
  const reloadSession = useCallback(async () => {
    const current = await getAuthClient().getSession();
    setSession(current.data as { user: { id: string; email?: string } } | null);
  }, []);
  useEffect(() => {
    if (!authConfigured) {
      setIsPending(false);
      return;
    }
    reloadSession()
      .catch(() => setSession(null))
      .finally(() => setIsPending(false));
  }, [reloadSession]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewVersions, setPreviewVersions] = useState<PreviewVersion[]>([]);
  const [evidenceFeed, setEvidenceFeed] = useState<EvidenceFeed | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showWorkspaceCreate, setShowWorkspaceCreate] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [discoveryQuery, setDiscoveryQuery] = useState("");
  const [discoveryExternalId, setDiscoveryExternalId] = useState("");
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(true);
  const [view, setView] = useState<"map" | "calendar" | "inbox" | "studio">(
    "map"
  );
  const [showFilters, setShowFilters] = useState(false);
  const [filterWebsite, setFilterWebsite] = useState<
    "all" | "unknown" | "reported"
  >("all");
  const [studioDevice, setStudioDevice] = useState<"desktop" | "mobile">(
    "desktop"
  );
  const [designDirection, setDesignDirection] = useState<
    "editorial" | "atelier" | "modern"
  >("editorial");
  const [draftHeadline, setDraftHeadline] = useState("");
  const [draftIntroduction, setDraftIntroduction] = useState("");
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false);
  const [sheetTouchY, setSheetTouchY] = useState<number | null>(null);
  const [mobileMeasuresOpen, setMobileMeasuresOpen] = useState(false);

  const refreshWorkspaces = useCallback(async () => {
    const result = await studioApi<{ workspaces: Workspace[] }>("/workspaces");
    setWorkspaces(result.workspaces);
    setWorkspaceId((prev) =>
      result.workspaces.some((w) => w.id === prev)
        ? prev
        : (result.workspaces.at(0)?.id ?? "")
    );
  }, []);
  const refresh = useCallback(async (ws: string) => {
    if (!ws) {
      setProspects([]);
      setJobs([]);
      return;
    }
    const [a, b] = await Promise.all([
      studioApi<{ prospects: Prospect[] }>(
        `/workspaces/${encodeURIComponent(ws)}/prospects`
      ),
      studioApi<{ jobs: Job[] }>(`/workspaces/${encodeURIComponent(ws)}/jobs`),
    ]);
    setProspects(a.prospects);
    setJobs(b.jobs);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setWorkspaces([]);
      setWorkspaceId("");
      setProspects([]);
      setJobs([]);
      return;
    }
    refreshWorkspaces().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load workspaces")
    );
  }, [session?.user?.id, refreshWorkspaces]);

  useEffect(() => {
    if (!workspaceId) {
      setProspects([]);
      setJobs([]);
      return;
    }
    refresh(workspaceId).catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load prospects")
    );
    setSelected(null);
    setPreview(null);
    setPreviewVersions([]);
    setReview(null);
  }, [workspaceId, refresh]);

  useEffect(() => {
    if (!(workspaceId && selected)) {
      setPreviewVersions([]);
      setReview(null);
      return;
    }
    studioApi<{ previews: PreviewVersion[] }>(
      `/workspaces/${workspaceId}/prospects/${selected}/previews`
    )
      .then((result) => setPreviewVersions(result.previews))
      .catch(() => setPreviewVersions([]));
  }, [workspaceId, selected]);

  const completedJobCount = jobs.filter(
    (job) => job.state === "completed"
  ).length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: finished background jobs invalidate the stored evidence view.
  useEffect(() => {
    if (!(workspaceId && selected)) {
      setEvidenceFeed(null);
      return;
    }
    let active = true;
    void studioApi<EvidenceFeed>(
      `/workspaces/${workspaceId}/prospects/${selected}/evidence`
    )
      .then((feed) => {
        if (active) {
          setEvidenceFeed(feed);
        }
      })
      .catch(() => {
        if (active) {
          setEvidenceFeed(null);
        }
      });
    return () => {
      active = false;
    };
  }, [completedJobCount, selected, workspaceId]);

  const current = workspaces.find((w) => w.id === workspaceId);
  const isOperator = current?.role === "owner" || current?.role === "operator";
  const chosen = prospects.find((p) => p.id === selected);
  const filtered = useMemo(
    () =>
      prospects.filter(
        (p) =>
          (filterWebsite === "all" ||
            (filterWebsite === "unknown"
              ? p.websiteStatus === "unknown"
              : p.websiteStatus !== "unknown")) &&
          `${p.name} ${p.physicalAddress ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [prospects, query, filterWebsite]
  );
  const statusJobs = chosen
    ? jobs.filter((j) => j.prospectId === chosen.id)
    : [];
  const processingJobs = jobs.some((job) =>
    ["queued", "running", "retrying"].includes(job.state)
  );
  // Durable jobs continue on the Sprite; refresh until a terminal state arrives.
  useEffect(() => {
    if (!(workspaceId && session?.user?.id && processingJobs)) {
      return;
    }
    const timer = setInterval(() => {
      void refresh(workspaceId).catch(() => {
        // Leave the current job state visible; allow the next poll to recover.
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [processingJobs, refresh, session?.user?.id, workspaceId]);

  // The worker produces a private versioned HTML draft on successful enrichment.
  useEffect(() => {
    if (
      !(
        workspaceId &&
        selected &&
        jobs.some(
          (job) => job.prospectId === selected && job.state === "completed"
        )
      )
    ) {
      return;
    }
    let active = true;
    const ws = workspaceId;
    const prospectId = selected;
    void studioApi<{ previews: PreviewVersion[] }>(
      `/workspaces/${ws}/prospects/${prospectId}/previews`
    )
      .then(async (result) => {
        if (!active) {
          return;
        }
        setPreviewVersions(result.previews);
        const [newest] = result.previews;
        if (newest && !preview) {
          const draft = await studioApi<Preview>(
            `/workspaces/${ws}/previews/${newest.previewId}`
          );
          if (active) {
            setPreview(draft);
          }
        }
      })
      .catch(() => {
        // The job is durable; a subsequent selection or reload can read the draft.
      });
    return () => {
      active = false;
    };
  }, [jobs, preview, selected, workspaceId]);

  const stageCounts = useMemo(
    () => ({
      all: prospects.length,
      queued: jobs.filter((j) => j.state === "queued").length,
      unknown: prospects.filter((p) => p.websiteStatus === "unknown").length,
    }),
    [prospects, jobs]
  );

  async function action<T>(
    name: string,
    op: () => Promise<T>,
    done: (res: T) => Promise<void> | void
  ) {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      const result = await op();
      await done(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setBusy(null);
    }
  }
  async function createWorkspace(e: FormEvent) {
    e.preventDefault();
    await action(
      "workspace",
      () =>
        studioApi<{ workspaceId: string }>("/workspaces", {
          body: JSON.stringify({ name: workspaceName }),
          method: "POST",
        }),
      async ({ workspaceId: newId }) => {
        setWorkspaceName("");
        setShowWorkspaceCreate(false);
        await refreshWorkspaces();
        setWorkspaceId(newId);
        setNotice("New workspace created. You are the owner.");
      }
    );
  }
  async function createProspect(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId) {
      return;
    }
    const payload = {
      name: newName.trim(),
      ...(newAddress.trim() ? { physicalAddress: newAddress.trim() } : {}),
      ...(newWebsite.trim() ? { websiteUrl: newWebsite.trim() } : {}),
    };
    await action(
      "prospect",
      () =>
        studioApi<{ prospectId: string }>(
          `/workspaces/${workspaceId}/prospects`,
          { body: JSON.stringify(payload), method: "POST" }
        ),
      async ({ prospectId }) => {
        setShowCreate(false);
        setNewName("");
        setNewAddress("");
        setNewWebsite("");
        await refresh(workspaceId);
        setSelected(prospectId);
        setNotice("Prospect saved with operator-reported source evidence.");
      }
    );
  }
  async function discoverLicense(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId) {
      return;
    }
    const payload = {
      query: discoveryQuery.trim(),
      ...(discoveryExternalId.trim()
        ? { externalId: discoveryExternalId.trim() }
        : {}),
    };
    await action(
      "discover",
      () =>
        studioApi<{ prospectId: string; kind: string; recordStatus: string }>(
          `/workspaces/${workspaceId}/discover/minneapolis-license`,
          { body: JSON.stringify(payload), method: "POST" }
        ),
      async ({ prospectId, kind }) => {
        await refresh(workspaceId);
        setSelected(prospectId);
        setDiscoveryExternalId("");
        if (kind === "duplicate") {
          setNotice(
            "Existing sourced prospect selected; duplicate record not created. Review its job status or generate another draft."
          );
          return;
        }
        // One deliberate import action starts the supported fixed-source workflow.
        // If enqueue fails, admission remains durable and can be retried manually.
        try {
          await studioApi(
            `/workspaces/${workspaceId}/prospects/${prospectId}/jobs`,
            {
              body: JSON.stringify({ type: "enrich" }),
              headers: { "Idempotency-Key": `import-${prospectId}` },
              method: "POST",
            }
          );
          await refresh(workspaceId);
          setNotice(
            "Historical municipal source imported and enrichment queued. A private site draft will be generated automatically after the source is checked."
          );
        } catch (importFailure) {
          setNotice(
            `Source record saved, but enrichment was not queued: ${importFailure instanceof Error ? importFailure.message : "Unknown error"}. Use source enrichment to retry.`
          );
        }
      }
    );
  }
  async function enqueue(prospectId: string) {
    await action(
      "enqueue",
      () =>
        studioApi<{ jobId: string }>(
          `/workspaces/${workspaceId}/prospects/${prospectId}/jobs`,
          {
            body: JSON.stringify({ type: "enrich" }),
            headers: { "Idempotency-Key": `ui-${crypto.randomUUID()}` },
            method: "POST",
          }
        ),
      async () => {
        await refresh(workspaceId);
        setNotice(
          "Enrichment queued. The production Sprite processes it automatically and saves a private site draft when complete."
        );
      }
    );
  }
  function downloadPrivateHtml() {
    if (!(preview && chosen)) {
      return;
    }
    const artifact = new Blob([preview.html], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(artifact);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${chosen.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 52)}-draft-v${preview.version}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function createPreview(prospectId: string) {
    await action(
      "preview",
      () =>
        studioApi<{ previewId: string }>(
          `/workspaces/${workspaceId}/prospects/${prospectId}/previews`,
          {
            body: JSON.stringify({
              design: designDirection,
              ...(draftHeadline.trim()
                ? { headline: draftHeadline.trim() }
                : {}),
              ...(draftIntroduction.trim()
                ? { introduction: draftIntroduction.trim() }
                : {}),
            }),
            method: "POST",
          }
        ),
      async (res) => {
        const details = await studioApi<Preview>(
          `/workspaces/${workspaceId}/previews/${res.previewId}`
        );
        setPreview(details);
        setReview(null);
        const versions = await studioApi<{ previews: PreviewVersion[] }>(
          `/workspaces/${workspaceId}/prospects/${prospectId}/previews`
        );
        setPreviewVersions(versions.previews);
        setNotice(
          `Private draft v${details.version} generated. No publication or outreach occurred.`
        );
      }
    );
  }

  async function loadPreview(previewId: string) {
    await action(
      "load-preview",
      () =>
        studioApi<Preview>(`/workspaces/${workspaceId}/previews/${previewId}`),
      async (details) => {
        setPreview(details);
        try {
          const record = await studioApi<Review>(
            `/workspaces/${workspaceId}/previews/${previewId}/review`
          );
          setReview(record);
        } catch {
          setReview(null);
        }
      }
    );
  }
  async function requestReview() {
    if (!preview) {
      return;
    }
    const { previewId } = preview;
    await action(
      "request-review",
      () =>
        studioApi<{ approvalId: string }>(
          `/workspaces/${workspaceId}/previews/${previewId}/review`,
          { body: "{}", method: "POST" }
        ),
      async () => {
        setReview(
          await studioApi<Review>(
            `/workspaces/${workspaceId}/previews/${previewId}/review`
          )
        );
        setNotice(
          "Private concept submitted for owner review. Nothing was published."
        );
      }
    );
  }
  async function decideReview(decision: "approved" | "rejected") {
    if (!(preview && chosen)) {
      return;
    }
    const { previewId } = preview;
    await action(
      "decision",
      () =>
        studioApi<{ approvalId: string }>(
          `/workspaces/${workspaceId}/previews/${previewId}/decision`,
          { body: JSON.stringify({ decision }), method: "POST" }
        ),
      async () => {
        setReview(
          await studioApi<Review>(
            `/workspaces/${workspaceId}/previews/${previewId}/review`
          )
        );
        const versions = await studioApi<{ previews: PreviewVersion[] }>(
          `/workspaces/${workspaceId}/prospects/${chosen.id}/previews`
        );
        setPreviewVersions(versions.previews);
        setNotice(
          `Private concept ${decision}. No public deployment or outreach occurred.`
        );
      }
    );
  }

  if (isPending) {
    return (
      <main className="studio-loading">
        <LoaderCircle className="spin" size={32} />
        <span>Checking secure session…</span>
      </main>
    );
  }
  if (!session?.user) {
    return <Login onAuthenticated={reloadSession} />;
  }
  return (
    <main className="studio-shell">
      <header className="studio-topbar">
        <div className="studio-brand">
          <span className="studio-brand-mark">
            P<span>.</span>
          </span>
          <span>
            Prospect <b>Studio</b>
          </span>
        </div>
        <div className="studio-top-center">
          <span className="studio-environment">
            <span className="studio-live-dot" /> MINNEAPOLIS–ST. PAUL
          </span>
          <span className="studio-top-divider" />
          <span className="studio-top-breadcrumb">
            Prospect intelligence · Twin Cities
          </span>
        </div>
        <nav aria-label="Main navigation" className="prototype-top-nav">
          <button
            className={view === "map" ? "active" : ""}
            onClick={() => setView("map")}
            type="button"
          >
            <MapPin size={16} /> Map
          </button>
          <button
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
            type="button"
          >
            <CalendarDays size={16} /> Calendar
          </button>
          <button
            className={view === "inbox" ? "active" : ""}
            onClick={() => setView("inbox")}
            type="button"
          >
            <Inbox size={16} /> Inbox
          </button>
          <button
            className={view === "studio" ? "active" : ""}
            onClick={() => setView("studio")}
            type="button"
          >
            <PanelsTopLeft size={16} /> Studio
          </button>
        </nav>
        <div className="studio-top-actions">
          {isOperator && workspaceId ? (
            <StudioAgent
              onNavigate={setView}
              onRefresh={() => refresh(workspaceId)}
              onSelectProspect={setSelected}
              request={studioApi}
              workspaceId={workspaceId}
            />
          ) : null}
          <button
            aria-label="Toggle workspace panel"
            className="studio-icon-button prototype-desktop-sidebar-toggle"
            onClick={() => setSidebar((x) => !x)}
            type="button"
          >
            <Layers3 size={18} />
          </button>
          <button
            aria-label="Search prospects"
            className="prototype-mobile-search"
            onClick={() => {
              setView("map");
              setMobileSheetExpanded(true);
              setTimeout(
                () => document.getElementById("prospect-search")?.focus(),
                180
              );
            }}
            type="button"
          >
            <Search size={19} />
          </button>
          <div className="studio-avatar">
            {session.user.email?.slice(0, 1).toUpperCase() ?? "U"}
          </div>
          <button
            className="studio-signout"
            onClick={() =>
              void getAuthClient()
                .signOut()
                .then(() => setSession(null))
            }
            type="button"
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </header>
      <div className="studio-workspace-row">
        <div className="studio-workspace-select">
          <Building2 size={16} />
          <select
            aria-label="Active workspace"
            onChange={(e) => setWorkspaceId(e.target.value)}
            value={workspaceId}
          >
            <option value="">Select a workspace</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {w.role}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        <button
          className="studio-text-button"
          onClick={() => setShowWorkspaceCreate(true)}
          type="button"
        >
          <Plus size={14} /> New workspace
        </button>
        <span className="studio-workspace-cap">
          <Shield size={14} /> Workspace-scoped access
        </span>
      </div>
      {error ? (
        <div className="studio-banner studio-banner-error" role="alert">
          <CircleHelp size={17} />
          <span>{error}</span>
          <button
            aria-label="Dismiss error"
            onClick={() => setError(null)}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="studio-banner studio-banner-info" role="status">
          <BadgeCheck size={17} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss message"
            onClick={() => setNotice(null)}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      {workspaceId && prospects.length === 0 && view === "map" ? (
        <section
          aria-label="Start your first prospect workflow"
          className="studio-onboarding"
        >
          <div>
            <span className="studio-eyebrow">WORKSPACE READY · FIRST RUN</span>
            <h2>
              Turn your first business into a sourced, reviewable website
              concept.
            </h2>
            <p>
              Start with a business you know, or import a historical public
              record to run source enrichment through Rivet Cloud and the Sprite
              worker. Concepts remain private until you approve them.
            </p>
          </div>
          <div className="studio-onboarding-actions">
            <button
              className="studio-btn-primary"
              onClick={() => setShowCreate(true)}
              type="button"
            >
              <Plus size={16} /> Add a business
            </button>
            <button
              className="studio-btn-secondary"
              onClick={() => {
                setDiscoveryQuery("MCCLOSKEY");
                setDiscoveryExternalId("TLIC19984");
                setSidebar(true);
                setMobileSheetExpanded(true);
                setNotice(
                  "Historical Minneapolis example filled into the source-import form. Review and choose Import sourced record."
                );
              }}
              type="button"
            >
              <Search size={16} /> Try a sourced example
            </button>
          </div>
        </section>
      ) : null}
      {view === "map" ? (
        <div
          className={`studio-main-grid prototype-main-grid ${chosen ? "has-detail" : "no-detail"}`}
        >
          {sidebar ? (
            <aside
              className={`studio-sidebar ${mobileSheetExpanded ? "mobile-expanded" : ""}`}
            >
              <button
                aria-expanded={mobileSheetExpanded}
                aria-label={
                  mobileSheetExpanded
                    ? "Collapse prospects"
                    : "Expand prospects"
                }
                className="prototype-sheet-grip"
                onClick={() => setMobileSheetExpanded((v) => !v)}
                onTouchEnd={(e) => {
                  if (
                    sheetTouchY !== null &&
                    e.changedTouches[0] &&
                    Math.abs(e.changedTouches[0].clientY - sheetTouchY) > 35
                  ) {
                    setMobileSheetExpanded(
                      e.changedTouches[0].clientY < sheetTouchY
                    );
                  }
                }}
                onTouchStart={(e) =>
                  setSheetTouchY(e.touches[0]?.clientY ?? null)
                }
                type="button"
              >
                <span />
                <span className="prototype-grip-label">
                  {mobileSheetExpanded ? "Collapse" : "Explore prospects"}
                </span>
              </button>
              <div className="studio-sidebar-heading">
                <span className="studio-eyebrow">YOUR PIPELINE</span>
                <h1>
                  Prospects <span>{stageCounts.all}</span>
                </h1>
                <p>Find the opportunity. Build the proof.</p>
              </div>
              <div className="studio-stats">
                <div>
                  <strong>{stageCounts.all}</strong>
                  <span>PROSPECTS</span>
                </div>
                <div>
                  <strong>{stageCounts.unknown}</strong>
                  <span>UNKNOWN WEB</span>
                </div>
                <div>
                  <strong>{stageCounts.queued}</strong>
                  <span>QUEUED</span>
                </div>
              </div>
              <div className="prototype-side-actions">
                <button onClick={() => setView("inbox")} type="button">
                  <Inbox size={16} /> Inbox <span>0</span>
                </button>
                <button onClick={() => setShowFilters((v) => !v)} type="button">
                  <SlidersHorizontal size={16} /> Filters
                </button>
              </div>
              {showFilters ? (
                <div className="prototype-filters">
                  <label>
                    Website status
                    <select
                      onChange={(e) =>
                        setFilterWebsite(
                          e.target.value as "all" | "unknown" | "reported"
                        )
                      }
                      value={filterWebsite}
                    >
                      <option value="all">All records</option>
                      <option value="unknown">Unknown</option>
                      <option value="reported">Reported website</option>
                    </select>
                  </label>
                  <button
                    className="studio-text-button"
                    onClick={() => {
                      setQuery("");
                      setFilterWebsite("all");
                    }}
                    type="button"
                  >
                    Clear all
                  </button>
                </div>
              ) : null}
              <div className="studio-list-heading">
                <h2>
                  {filtered.length} shown · {prospects.length} total
                </h2>
                <button
                  aria-label="Refresh prospects"
                  className="studio-icon-button"
                  onClick={() => workspaceId && void refresh(workspaceId)}
                  type="button"
                >
                  <RefreshCcw size={15} />
                </button>
              </div>
              <label className="studio-search">
                <Search size={17} />
                <input
                  id="prospect-search"
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search businesses…"
                  value={query}
                />
              </label>
              <div className="studio-list-items">
                {workspaceId ? (
                  filtered.length === 0 ? (
                    <div className="studio-empty-list">
                      <Building2 size={26} />
                      <p>
                        {prospects.length === 0
                          ? "Your workspace is ready. Add a business to create a private site concept, or import a historical Minneapolis record to run the full sourced pipeline."
                          : "No prospects match the current search and filters."}
                      </p>
                      {prospects.length === 0 && isOperator ? (
                        <button
                          className="studio-btn-primary"
                          onClick={() => setShowCreate(true)}
                          type="button"
                        >
                          <Plus size={16} /> Add your first prospect
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    filtered.map((p) => (
                      <button
                        className={`studio-prospect-row ${p.id === selected ? "selected" : ""}`}
                        key={p.id}
                        onClick={() => {
                          setSelected(p.id);
                          setMobileSheetExpanded(false);
                          setPreview(null);
                        }}
                        type="button"
                      >
                        <span className="studio-prospect-icon">
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.physicalAddress ?? "Address not reported"}
                          </small>
                          <em>
                            {p.websiteStatus === "unknown"
                              ? "Website unknown"
                              : "Reported website"}
                          </em>
                        </span>
                        <ArrowRight size={14} />
                      </button>
                    ))
                  )
                ) : (
                  <div className="studio-empty-list">
                    <Database size={26} />
                    <p>Create or select a workspace to begin.</p>
                  </div>
                )}
              </div>
              <div className="studio-sidebar-footer">
                <div className="prototype-batch">
                  <span>{stageCounts.queued} queued</span>
                  <span>
                    {jobs.filter((j) => j.state === "running").length} running
                  </span>
                  <span>
                    {jobs.filter((j) => j.state === "failed").length} blocked
                  </span>
                </div>
                <button
                  className="studio-btn-primary"
                  disabled={!isOperator}
                  onClick={() => setShowCreate(true)}
                  type="button"
                >
                  <Plus size={17} /> Add prospect
                </button>
                <form
                  className="studio-discovery-form"
                  onSubmit={discoverLicense}
                >
                  <label className="studio-eyebrow" htmlFor="license-lookup">
                    HISTORICAL MINNEAPOLIS LICENSE RECORDS
                  </label>
                  <input
                    aria-label="Historical business name search"
                    id="license-lookup"
                    maxLength={80}
                    minLength={3}
                    onChange={(e) => setDiscoveryQuery(e.target.value)}
                    placeholder="Search business name"
                    required
                    value={discoveryQuery}
                  />
                  <input
                    aria-label="License identifier to resolve multiple results"
                    maxLength={200}
                    onChange={(e) => setDiscoveryExternalId(e.target.value)}
                    placeholder="Optional license ID for matches"
                    value={discoveryExternalId}
                  />
                  <button
                    className="studio-btn-secondary"
                    disabled={!isOperator || busy !== null}
                    type="submit"
                  >
                    <Search size={15} /> Import sourced record
                  </button>
                  <p>
                    Historical public records are not proof of a current
                    business or active license.
                  </p>
                </form>
              </div>
            </aside>
          ) : null}
          <section className="studio-map-panel">
            <StudioMap />
            <div className="prototype-map-glass-chip">
              <span className="studio-live-dot" /> {filtered.length} prospects
              in view
            </div>
            <div
              className={[
                "prototype-five-measures",
                mobileMeasuresOpen ? "mobile-measures-open" : "",
              ].join(" ")}
            >
              <button
                aria-expanded={mobileMeasuresOpen}
                className="prototype-measures-toggle"
                onClick={() => setMobileMeasuresOpen((x) => !x)}
                type="button"
              >
                <Activity size={15} /> Five measures <ChevronDown size={15} />
              </button>
              <div className="prototype-five-measures-list">
                {[
                  "Cost per qualified prospect",
                  "Demo-to-reply",
                  "Reply-to-call · call-to-close",
                  "Payment to live site",
                  "Sends on trigger event",
                ].map((t) => (
                  <div key={t}>
                    <span>{t}</span>
                    <b>No data yet</b>
                  </div>
                ))}
              </div>
            </div>
            <div className="studio-map-top">
              <span>
                <MapPin size={15} /> Minneapolis–Saint Paul
              </span>
              <span>BASE MAP / OSM</span>
            </div>
            <div className="studio-map-legend">
              <MapPin size={15} />
              <span>
                Map pins require verified coordinates; none are inferred from
                addresses.
              </span>
            </div>
          </section>
          {chosen ? (
            <aside className="studio-inspector">
              {chosen ? (
                <>
                  <div className="studio-inspector-head">
                    <span className="studio-eyebrow">PROSPECT / INSPECTOR</span>
                    <span className="studio-inspector-status">REPORTED</span>
                  </div>
                  <button
                    aria-label="Close prospect details"
                    className="prototype-close-inspector"
                    onClick={() => setSelected(null)}
                    type="button"
                  >
                    <X size={17} />
                  </button>
                  <h2>{chosen.name}</h2>
                  <div className="prototype-inspector-tabs">
                    <span>Overview</span>
                    <button onClick={() => setView("studio")} type="button">
                      Design
                    </button>
                    <button onClick={() => setView("inbox")} type="button">
                      Inbox
                    </button>
                  </div>
                  <p className="studio-inspector-address">
                    <MapPin size={16} />
                    {chosen.physicalAddress ?? "Location not reported"}
                  </p>
                  <div className="studio-info-block">
                    <span>ONLINE PRESENCE</span>
                    <strong>
                      {chosen.websiteStatus === "unknown"
                        ? "Not established"
                        : "Reported website"}
                    </strong>
                    {chosen.websiteUrl ? (
                      <a
                        href={chosen.websiteUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {chosen.websiteUrl}
                        <ExternalLink size={13} />
                      </a>
                    ) : (
                      <p>
                        Absence of a reported website does not prove a business
                        has no website.
                      </p>
                    )}
                  </div>
                  <div className="studio-info-block">
                    <span>SOURCE CONFIDENCE</span>
                    <div className="studio-source">
                      <Shield size={18} />
                      <div>
                        <strong>
                          {chosen.hasExternalSource
                            ? "Historical public registry"
                            : "Operator-reported"}
                        </strong>
                        <p>
                          {chosen.hasExternalSource
                            ? "Registry evidence is sourced, but business activity and license status remain unverified."
                            : "Operator-provided details are unverified. Add a sourced record for registry enrichment."}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="studio-info-block">
                    <span>SOURCED EVIDENCE &amp; REPORTED CLAIMS</span>
                    <strong>
                      {evidenceFeed
                        ? `${evidenceFeed.evidence.length} sources · ${evidenceFeed.claims.length} claims`
                        : "Loading source history"}
                    </strong>
                    {evidenceFeed?.evidence.slice(0, 3).map((item) => (
                      <div key={item.id}>
                        <p>{item.title}</p>
                        <small>
                          {item.type.replaceAll("_", " ")} ·{" "}
                          {new Date(item.capturedAt).toLocaleDateString()}
                        </small>
                        {item.sourceUri.startsWith("https://") ? (
                          <a
                            href={item.sourceUri}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Inspect original source <ExternalLink size={13} />
                          </a>
                        ) : null}
                      </div>
                    ))}
                    {evidenceFeed?.claims.slice(0, 8).map((claim) => (
                      <p key={claim.id}>
                        <b>{claim.field}</b> · {claim.value ?? "Unknown"}{" "}
                        <small>({claim.kind})</small>
                      </p>
                    ))}
                    <p>
                      Claims are attributed reports, not independently verified
                      current facts.
                    </p>
                  </div>
                  <div className="studio-pipeline-block">
                    <span className="studio-eyebrow">WORKFLOW ACTIONS</span>
                    <div className="studio-step">
                      <span className="studio-step-icon done">
                        <BadgeCheck size={16} />
                      </span>
                      <div>
                        <strong>01 / Discovered</strong>
                        <p>Durable prospect record</p>
                      </div>
                    </div>
                    <div className="studio-step">
                      <span className="studio-step-icon">
                        <Activity size={17} />
                      </span>
                      <div>
                        <strong>02 / Enrichment</strong>
                        <p>
                          {statusJobs.at(0)?.state ??
                            (chosen.hasExternalSource
                              ? "Ready to run"
                              : "Requires a sourced record")}
                        </p>
                      </div>
                    </div>
                    <div className="studio-step">
                      <span className="studio-step-icon">
                        <Globe2 size={17} />
                      </span>
                      <div>
                        <strong>03 / Website concept</strong>
                        <p>Private, versioned draft</p>
                      </div>
                    </div>
                    <div className="studio-step">
                      <span className="studio-step-icon">
                        <Eye size={17} />
                      </span>
                      <div>
                        <strong>04 / Review</strong>
                        <p>No external publication or outreach</p>
                      </div>
                    </div>
                  </div>
                  <button
                    className="studio-btn-secondary"
                    disabled={
                      !isOperator || busy !== null || !chosen.hasExternalSource
                    }
                    onClick={() => void enqueue(chosen.id)}
                    type="button"
                  >
                    {busy === "enqueue" ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Workflow size={17} />
                    )}{" "}
                    {chosen.hasExternalSource
                      ? "Run source enrichment"
                      : "Enrichment needs a public source"}
                  </button>
                  <button
                    className="studio-btn-primary"
                    disabled={!isOperator || busy !== null}
                    onClick={() => void createPreview(chosen.id)}
                    type="button"
                  >
                    {busy === "preview" ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Sparkles size={17} />
                    )}{" "}
                    Generate private concept
                  </button>
                  {previewVersions.length > 0 ? (
                    <div className="studio-info-block">
                      <span>VERSION HISTORY</span>
                      {previewVersions.map((version) => (
                        <button
                          className="studio-text-button"
                          disabled={busy !== null}
                          key={version.previewId}
                          onClick={() => void loadPreview(version.previewId)}
                          type="button"
                        >
                          Version {version.version} · {version.state}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {preview ? (
                    <div className="studio-preview-result">
                      <div>
                        <b>Private preview · v{preview.version}</b>
                        <span>{review?.state ?? "DRAFT"} · NOT PUBLISHED</span>
                      </div>
                      {isOperator && !review ? (
                        <button
                          className="studio-btn-secondary"
                          disabled={busy !== null}
                          onClick={() => void requestReview()}
                          type="button"
                        >
                          Request owner review
                        </button>
                      ) : null}
                      {current?.role === "owner" &&
                      review?.state === "pending" ? (
                        <div>
                          <button
                            className="studio-btn-primary"
                            disabled={busy !== null}
                            onClick={() => void decideReview("approved")}
                            type="button"
                          >
                            Approve private concept
                          </button>
                          <button
                            className="studio-btn-secondary"
                            disabled={busy !== null}
                            onClick={() => void decideReview("rejected")}
                            type="button"
                          >
                            Reject concept
                          </button>
                        </div>
                      ) : null}
                      <button
                        className="studio-btn-secondary"
                        onClick={downloadPrivateHtml}
                        type="button"
                      >
                        Download private HTML draft
                      </button>
                      <iframe
                        loading="lazy"
                        sandbox=""
                        srcDoc={preview.html}
                        title={`Private draft for ${chosen.name}`}
                      />
                    </div>
                  ) : null}
                  <div className="studio-inspector-foot">
                    <LockKeyhole size={15} /> No automatic sending or publishing
                  </div>
                </>
              ) : (
                <div className="studio-no-selection">
                  <div className="studio-no-selection-symbol">
                    <Layers3 size={32} />
                  </div>
                  <span className="studio-eyebrow">INSPECTOR</span>
                  <h2>
                    From signal
                    <br />
                    to website.
                  </h2>
                  <p>
                    Select a prospect to inspect its provenance, queue
                    enrichment, or generate a draft concept.
                  </p>
                  <div className="studio-no-selection-flow">
                    <span>01 / DISCOVER</span>
                    <span>02 / ENRICH</span>
                    <span>03 / BUILD</span>
                    <span>04 / REVIEW</span>
                  </div>
                </div>
              )}
            </aside>
          ) : null}
        </div>
      ) : null}
      {view === "studio" ? (
        <section className="prototype-view-page">
          <header className="prototype-page-header">
            <span className="studio-eyebrow">DESIGN STUDIO</span>
            <h1>Turn evidence into a first impression.</h1>
            <p>
              Private, versioned website concepts with owner-controlled
              approvals.
            </p>
          </header>
          <div className="prototype-studio-layout">
            <aside className="prototype-studio-controls">
              <h2>Studio workspace</h2>
              <label>
                Prospect
                <select
                  onChange={(e) => {
                    setSelected(e.target.value || null);
                    setPreview(null);
                  }}
                  value={selected ?? ""}
                >
                  <option value="">Select a prospect</option>
                  {prospects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {chosen ? (
                <>
                  <p>{chosen.name}</p>
                  <label>
                    Visual direction
                    <select
                      onChange={(event) =>
                        setDesignDirection(
                          event.target.value as
                            | "editorial"
                            | "atelier"
                            | "modern"
                        )
                      }
                      value={designDirection}
                    >
                      <option value="editorial">Editorial · Sage</option>
                      <option value="atelier">Atelier · Warm</option>
                      <option value="modern">Modern · Cool</option>
                    </select>
                  </label>
                  <label>
                    Headline for this draft
                    <input
                      maxLength={140}
                      onChange={(event) => setDraftHeadline(event.target.value)}
                      placeholder={chosen.name}
                      value={draftHeadline}
                    />
                  </label>
                  <label>
                    Introduction (operator draft, not verified)
                    <textarea
                      maxLength={500}
                      onChange={(event) =>
                        setDraftIntroduction(event.target.value)
                      }
                      placeholder="Describe the positioning you want to propose. Confirm business claims before publication."
                      rows={4}
                      value={draftIntroduction}
                    />
                  </label>
                  <button
                    className="studio-btn-primary"
                    disabled={!isOperator || busy !== null}
                    onClick={() => void createPreview(chosen.id)}
                    type="button"
                  >
                    <Sparkles size={16} /> Generate new version
                  </button>
                  <span className="studio-eyebrow">VERSION HISTORY</span>
                  {previewVersions.map((v) => (
                    <button
                      className="studio-text-button"
                      key={v.previewId}
                      onClick={() => void loadPreview(v.previewId)}
                      type="button"
                    >
                      Version {v.version} · {v.state}
                    </button>
                  ))}
                  {preview && !review && isOperator ? (
                    <button
                      className="studio-btn-secondary"
                      disabled={busy !== null}
                      onClick={() => void requestReview()}
                      type="button"
                    >
                      Request owner review
                    </button>
                  ) : null}
                  {preview &&
                  current?.role === "owner" &&
                  review?.state === "pending" ? (
                    <>
                      <button
                        className="studio-btn-primary"
                        disabled={busy !== null}
                        onClick={() => void decideReview("approved")}
                        type="button"
                      >
                        Approve private concept
                      </button>
                      <button
                        className="studio-btn-secondary"
                        disabled={busy !== null}
                        onClick={() => void decideReview("rejected")}
                        type="button"
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  <p>
                    Review: {review?.state ?? "Draft"} · No public publication
                  </p>
                </>
              ) : (
                <p>Select a saved prospect to begin designing.</p>
              )}
            </aside>
            <div className="prototype-studio-canvas">
              <div className="prototype-canvas-bar">
                <strong>{chosen?.name ?? "Design canvas"}</strong>
                <div>
                  <button
                    className={studioDevice === "desktop" ? "active" : ""}
                    onClick={() => setStudioDevice("desktop")}
                    type="button"
                  >
                    <Monitor size={16} /> Desktop
                  </button>
                  <button
                    className={studioDevice === "mobile" ? "active" : ""}
                    onClick={() => setStudioDevice("mobile")}
                    type="button"
                  >
                    <Smartphone size={16} /> Mobile
                  </button>
                </div>
              </div>
              {preview ? (
                <iframe
                  className={
                    studioDevice === "mobile" ? "prototype-mobile-preview" : ""
                  }
                  sandbox=""
                  srcDoc={preview.html}
                  title="Private generated website preview"
                />
              ) : (
                <div className="prototype-studio-empty">
                  <PanelsTopLeft size={40} />
                  <h2>Your design canvas</h2>
                  <p>Generate a private website draft to preview it here.</p>
                </div>
              )}
              <footer>
                <LockKeyhole size={14} /> Secure preview · Not published
              </footer>
            </div>
          </div>
        </section>
      ) : null}
      {view === "inbox" ? (
        <section className="prototype-view-page">
          <header className="prototype-page-header">
            <span className="studio-eyebrow">COMMUNICATIONS CENTER</span>
            <h1>Inbox</h1>
            <p>Prospect conversations and follow-up activity.</p>
          </header>
          <div className="prototype-metrics">
            {["Unread", "Needs reply", "Follow-ups", "Approvals"].map(
              (label) => (
                <div key={label}>
                  <strong>0</strong>
                  <span>{label}</span>
                </div>
              )
            )}
          </div>
          <div className="prototype-empty-state">
            <Inbox size={38} />
            <h2>No threads yet</h2>
            <p>
              Nobody has been contacted. Messaging is not connected to this
              staging workspace.
            </p>
            <button
              className="studio-btn-secondary"
              onClick={() => setView("map")}
              type="button"
            >
              Browse prospects
            </button>
          </div>
        </section>
      ) : null}
      {view === "calendar" ? (
        <section className="prototype-view-page">
          <header className="prototype-page-header">
            <span className="studio-eyebrow">PROSPECT RELATIONSHIPS</span>
            <h1>Calendar</h1>
            <p>Plan calls and track meetings once scheduling is connected.</p>
          </header>
          <div className="prototype-calendar">
            <div className="prototype-calendar-body">
              <h2>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
              <div className="prototype-calendar-week">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - d.getDay() + i);
                  return (
                    <div key={d.toISOString().slice(0, 10)}>
                      <small>
                        {d.toLocaleDateString("en-US", { weekday: "short" })}
                      </small>
                      <strong>{d.getDate()}</strong>
                    </div>
                  );
                })}
              </div>
              <div className="prototype-empty-state">
                <CalendarDays size={34} />
                <h2>No scheduled calls</h2>
                <p>Calendar integration has not been configured.</p>
              </div>
            </div>
            <aside className="prototype-calendar-plan">
              <span className="studio-eyebrow">PLAN A PHONE CALL</span>
              <h2>Meeting preparation</h2>
              <p>Connect scheduling to enable persistent appointments.</p>
              <label>
                Prospect
                <select disabled>
                  <option>Select after integration</option>
                </select>
              </label>
              <label>
                Date
                <input disabled type="date" />
              </label>
              <label>
                Time
                <input disabled type="time" />
              </label>
              <button className="studio-btn-primary" disabled type="button">
                Scheduling unavailable
              </button>
            </aside>
          </div>
        </section>
      ) : null}
      <nav aria-label="Mobile navigation" className="prototype-mobile-nav">
        <button
          className={view === "map" ? "active" : ""}
          onClick={() => setView("map")}
          type="button"
        >
          <MapPin size={20} />
          Map
        </button>
        <button
          className={view === "inbox" ? "active" : ""}
          onClick={() => setView("inbox")}
          type="button"
        >
          <Inbox size={20} />
          Inbox
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => setView("calendar")}
          type="button"
        >
          <CalendarDays size={20} />
          Calendar
        </button>
        <button
          className={view === "studio" ? "active" : ""}
          onClick={() => setView("studio")}
          type="button"
        >
          <PanelsTopLeft size={20} />
          Studio
        </button>
      </nav>
      <footer className="studio-bottom">
        <span>
          <span className="studio-live-dot" /> STUDIO FOUNDATION
        </span>
        <span>
          Private operator surface · Authenticated actions · No autonomous
          outreach
        </span>
        <span>PROSPECT STUDIO / 2026</span>
      </footer>
      {showWorkspaceCreate ? (
        <div className="studio-modal-backdrop" role="presentation">
          <form className="studio-modal" onSubmit={createWorkspace}>
            <button
              aria-label="Close"
              className="studio-modal-close"
              onClick={() => setShowWorkspaceCreate(false)}
              type="button"
            >
              <X size={19} />
            </button>
            <span className="studio-eyebrow">WORKSPACE SETUP</span>
            <h2>Create workspace</h2>
            <p>
              A new private workspace grants its creator the owner role. Other
              workspaces are never accessible without membership.
            </p>
            <label>
              Name
              <input
                maxLength={160}
                minLength={2}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Your company or team"
                required
                value={workspaceName}
              />
            </label>
            <button
              className="studio-btn-primary"
              disabled={busy !== null}
              type="submit"
            >
              <Building2 size={17} /> Create workspace
            </button>
          </form>
        </div>
      ) : null}
      {showCreate ? (
        <div className="studio-modal-backdrop" role="presentation">
          <form className="studio-modal" onSubmit={createProspect}>
            <button
              aria-label="Close"
              className="studio-modal-close"
              onClick={() => setShowCreate(false)}
              type="button"
            >
              <X size={19} />
            </button>
            <span className="studio-eyebrow">NEW PROSPECT / MANUAL REPORT</span>
            <h2>Add business</h2>
            <p>
              Submit only facts you have a basis to report. Every record gets
              source-attributed evidence; no website is assumed when unknown.
            </p>
            <label>
              Business name
              <input
                maxLength={160}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Business name"
                required
                value={newName}
              />
            </label>
            <label>
              Physical address (optional)
              <input
                maxLength={300}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Street, city, region"
                value={newAddress}
              />
            </label>
            <label>
              Known website URL (optional)
              <input
                onChange={(e) => setNewWebsite(e.target.value)}
                placeholder="https://example.com"
                value={newWebsite}
              />
            </label>
            <button
              className="studio-btn-primary"
              disabled={busy !== null}
              type="submit"
            >
              {busy === "prospect" ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <FilePlus2 size={17} />
              )}{" "}
              Save reported prospect
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
