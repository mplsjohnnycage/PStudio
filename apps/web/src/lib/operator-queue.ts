/** Derived from workspace-scoped, persisted job records. Never synthesize inbox messages. */
export interface OperatorJob {
  attempt: number;
  id: string;
  prospectId: string;
  state: string;
  type: string;
}

export interface OperatorProspect {
  id: string;
  name: string;
}

export interface OperatorJobSummary {
  cancelled: number;
  done: number;
  needsYou: number;
  queued: number;
  running: number;
}

export interface OperatorQueueItem {
  jobId: string;
  label: string;
  prospectId: string;
  prospectName: string;
  state: string;
  type: string;
}

const LABELS: Record<string, string> = {
  awaiting_approval: "Awaiting approval",
  cancelled: "Cancelled",
  completed: "Completed",
  failed: "Needs attention",
  queued: "Queued",
  retrying: "Retrying",
  running: "Running",
};
const ORDER: Record<string, number> = {
  awaiting_approval: 0,
  cancelled: 5,
  completed: 4,
  failed: 0,
  queued: 3,
  retrying: 1,
  running: 2,
};

export function summarizeOperatorJobs(
  jobs: readonly OperatorJob[]
): OperatorJobSummary {
  const result = { cancelled: 0, done: 0, needsYou: 0, queued: 0, running: 0 };
  for (const job of jobs) {
    switch (job.state) {
      case "failed":
      case "awaiting_approval":
        result.needsYou += 1;
        break;
      case "queued":
      case "retrying":
        result.queued += 1;
        break;
      case "running":
        result.running += 1;
        break;
      case "completed":
        result.done += 1;
        break;
      case "cancelled":
        result.cancelled += 1;
        break;
      default:
        // Unknown persisted states must not be counted as success or attention.
        break;
    }
  }
  return result;
}

export function buildOperatorQueue(
  prospects: readonly OperatorProspect[],
  jobs: readonly OperatorJob[]
): OperatorQueueItem[] {
  const names = new Map(
    prospects.map((prospect) => [prospect.id, prospect.name])
  );
  return jobs
    .filter((job) => names.has(job.prospectId) && job.state in LABELS)
    .map((job) => ({
      jobId: job.id,
      label: LABELS[job.state] ?? "Unknown",
      prospectId: job.prospectId,
      prospectName: names.get(job.prospectId) ?? "",
      state: job.state,
      type: job.type,
    }))
    .sort((a, b) => (ORDER[a.state] ?? 99) - (ORDER[b.state] ?? 99));
}
