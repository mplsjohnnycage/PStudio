import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Database } from "./index";
import {
  approvals,
  previews,
  prospects,
  releases,
  workspaceMemberships,
} from "./schema/index";

type ReviewFailure = { kind: "not_found" } | { kind: "conflict" };
export type ReviewOpenResult =
  | ReviewFailure
  | {
      kind: "opened";
      approvalId: string;
      releaseId: string;
    };
export type ReviewDecisionResult =
  | ReviewFailure
  | {
      kind: "approved" | "rejected";
      approvalId: string;
      releaseId: string;
    };
export interface ReviewRecord {
  approvalId: string;
  decidedAt: Date | null;
  decidedBy: string | null;
  previewId: string;
  releaseId: string;
  state: string;
}
type ReviewDecision = "approved" | "rejected";

function stableApprovalId(previewId: string): string {
  return `approval_${createHash("sha256").update(previewId).digest("hex").slice(0, 40)}`;
}

export async function readWorkspaceReview(
  db: Database,
  userId: string,
  workspaceId: string,
  previewId: string
): Promise<ReviewRecord | null> {
  const rows = await db
    .select({
      approvalId: approvals.id,
      decidedAt: approvals.decidedAt,
      decidedBy: approvals.decidedBy,
      previewId: previews.id,
      releaseId: releases.id,
      state: approvals.state,
    })
    .from(approvals)
    .innerJoin(
      previews,
      and(
        eq(approvals.subjectType, "preview"),
        eq(approvals.subjectId, previews.id)
      )
    )
    .innerJoin(releases, eq(previews.releaseId, releases.id))
    .innerJoin(
      prospects,
      and(
        eq(prospects.id, previews.prospectId),
        eq(prospects.workspaceId, workspaceId)
      )
    )
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, prospects.workspaceId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .where(
      and(eq(previews.id, previewId), eq(approvals.prospectId, prospects.id))
    )
    .limit(1);
  return rows.at(0) ?? null;
}

/** Open an owner/operator-scoped review. This does not publish a website. */
export function openWorkspaceReview(
  db: Database,
  userId: string,
  workspaceId: string,
  previewId: string
): Promise<ReviewOpenResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        previewId: previews.id,
        prospectId: prospects.id,
        releaseId: releases.id,
        releaseStatus: releases.status,
        role: workspaceMemberships.role,
      })
      .from(previews)
      .innerJoin(releases, eq(previews.releaseId, releases.id))
      .innerJoin(
        prospects,
        and(
          eq(previews.prospectId, prospects.id),
          eq(prospects.workspaceId, workspaceId)
        )
      )
      .innerJoin(
        workspaceMemberships,
        and(
          eq(workspaceMemberships.workspaceId, prospects.workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      )
      .where(
        and(eq(previews.id, previewId), gt(previews.expiresAt, new Date()))
      )
      .for("update", { of: releases })
      .limit(1);
    const row = rows.at(0);
    if (!(row && ["owner", "operator"].includes(row.role))) {
      return { kind: "not_found" } as const;
    }
    const approvalId = stableApprovalId(previewId);
    const existing = await tx
      .select({ state: approvals.state })
      .from(approvals)
      .where(
        and(
          eq(approvals.id, approvalId),
          eq(approvals.prospectId, row.prospectId)
        )
      )
      .limit(1);
    const prior = existing.at(0);
    if (prior) {
      return prior.state === "pending"
        ? ({ approvalId, kind: "opened", releaseId: row.releaseId } as const)
        : ({ kind: "conflict" } as const);
    }
    if (row.releaseStatus !== "draft") {
      return { kind: "conflict" } as const;
    }
    await tx.insert(approvals).values({
      id: approvalId,
      prospectId: row.prospectId,
      state: "pending",
      subjectId: previewId,
      subjectType: "preview",
    });
    await tx
      .update(releases)
      .set({ status: "in_review" })
      .where(eq(releases.id, row.releaseId));
    await tx
      .update(previews)
      .set({ state: "in_review" })
      .where(eq(previews.id, previewId));
    return { approvalId, kind: "opened", releaseId: row.releaseId } as const;
  });
}

/** Only a CURRENT workspace owner may approve or reject a pending private draft. */
export async function decideWorkspaceReview(
  db: Database,
  userId: string,
  workspaceId: string,
  previewId: string,
  decision: ReviewDecision
): Promise<ReviewDecisionResult> {
  if (decision !== "approved" && decision !== "rejected") {
    return { kind: "conflict" };
  }
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        prospectId: prospects.id,
        releaseId: releases.id,
        role: workspaceMemberships.role,
      })
      .from(previews)
      .innerJoin(releases, eq(previews.releaseId, releases.id))
      .innerJoin(
        prospects,
        and(
          eq(previews.prospectId, prospects.id),
          eq(prospects.workspaceId, workspaceId)
        )
      )
      .innerJoin(
        workspaceMemberships,
        and(
          eq(workspaceMemberships.workspaceId, prospects.workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      )
      .where(
        and(eq(previews.id, previewId), gt(previews.expiresAt, new Date()))
      )
      .for("update", { of: releases })
      .limit(1);
    const row = rows.at(0);
    if (row?.role !== "owner") {
      return { kind: "not_found" } as const;
    }
    const approvalId = stableApprovalId(previewId);
    const existing = await tx
      .select({
        prospectId: approvals.prospectId,
        state: approvals.state,
        subjectId: approvals.subjectId,
      })
      .from(approvals)
      .where(eq(approvals.id, approvalId))
      .limit(1);
    const record = existing.at(0);
    if (record?.state !== "pending") {
      return record?.state === decision
        ? ({ approvalId, kind: decision, releaseId: row.releaseId } as const)
        : ({ kind: "conflict" } as const);
    }
    if (
      record.prospectId !== row.prospectId ||
      record.subjectId !== previewId
    ) {
      return { kind: "conflict" } as const;
    }
    const changed = await tx
      .update(approvals)
      .set({
        decidedAt: new Date(),
        decidedBy: userId,
        state: decision,
      })
      .where(and(eq(approvals.id, approvalId), eq(approvals.state, "pending")))
      .returning({ id: approvals.id });
    if (changed.length !== 1) {
      return { kind: "conflict" } as const;
    }
    await tx
      .update(releases)
      .set({ status: decision })
      .where(eq(releases.id, row.releaseId));
    await tx
      .update(previews)
      .set({ state: decision })
      .where(eq(previews.id, previewId));
    return { approvalId, kind: decision, releaseId: row.releaseId } as const;
  });
}
