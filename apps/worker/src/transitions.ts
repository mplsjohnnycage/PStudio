export type JobPhase =
  | "idle"
  | "awaiting_approval"
  | "queued"
  | "running"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled";

export interface JobState {
  attempt: number;
  jobId: string | null;
  maxAttempts: number;
  phase: JobPhase;
  prospectId: string | null;
}

export type JobCommand =
  | {
      type: "submit";
      jobId: string;
      prospectId: string;
      maxAttempts: number;
      requiresApproval: boolean;
    }
  | { type: "decision"; jobId: string; approved: boolean }
  | { type: "start" }
  | { type: "finish"; jobId: string; attempt: number; ok: boolean }
  | { type: "cancel"; jobId: string };

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function validId(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    IDENTIFIER.test(value)
  );
}

function submitJob(
  current: JobState,
  command: Extract<JobCommand, { type: "submit" }>
): JobState {
  if (
    !(
      validId(command.jobId) &&
      validId(command.prospectId) &&
      Number.isInteger(command.maxAttempts)
    ) ||
    command.maxAttempts < 1 ||
    command.maxAttempts > 20 ||
    typeof command.requiresApproval !== "boolean"
  ) {
    throw new Error("Invalid job submission");
  }
  if (current.phase !== "idle") {
    if (
      current.jobId !== command.jobId ||
      current.prospectId !== command.prospectId ||
      current.maxAttempts !== command.maxAttempts
    ) {
      throw new Error("Conflicting job identity");
    }
    return current;
  }
  return {
    attempt: 0,
    jobId: command.jobId,
    maxAttempts: command.maxAttempts,
    phase: command.requiresApproval ? "awaiting_approval" : "queued",
    prospectId: command.prospectId,
  };
}

function decideJob(
  current: JobState,
  command: Extract<JobCommand, { type: "decision" }>
): JobState {
  if (
    current.phase !== "awaiting_approval" ||
    current.jobId !== command.jobId
  ) {
    return current;
  }
  return { ...current, phase: command.approved ? "queued" : "cancelled" };
}

function startJob(current: JobState): JobState {
  if (
    (current.phase !== "queued" && current.phase !== "retrying") ||
    current.attempt >= current.maxAttempts
  ) {
    return current;
  }
  return { ...current, attempt: current.attempt + 1, phase: "running" };
}

function finishJob(
  current: JobState,
  command: Extract<JobCommand, { type: "finish" }>
): JobState {
  if (
    current.phase !== "running" ||
    current.jobId !== command.jobId ||
    !Number.isInteger(command.attempt) ||
    command.attempt !== current.attempt ||
    typeof command.ok !== "boolean"
  ) {
    return current;
  }
  if (command.ok) {
    return { ...current, phase: "completed" };
  }
  return {
    ...current,
    phase: current.attempt < current.maxAttempts ? "retrying" : "failed",
  };
}

function cancelJob(
  current: JobState,
  command: Extract<JobCommand, { type: "cancel" }>
): JobState {
  const terminal: JobPhase[] = ["completed", "failed", "cancelled", "idle"];
  if (current.jobId !== command.jobId || terminal.includes(current.phase)) {
    return current;
  }
  return { ...current, phase: "cancelled" };
}

/**
 * Deterministic, side-effect-free transitions. Rivet provides execution state;
 * Neon jobs is the intended authoritative product record, not this projection.
 * No network, email, publishing or customer-facing actions are allowed here.
 */
export function nextJobState(current: JobState, command: JobCommand): JobState {
  switch (command.type) {
    case "submit":
      return submitJob(current, command);
    case "decision":
      return decideJob(current, command);
    case "start":
      return startJob(current);
    case "finish":
      return finishJob(current, command);
    case "cancel":
      return cancelJob(current, command);
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}
