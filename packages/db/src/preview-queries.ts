import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, or } from "drizzle-orm";
import type { Database } from "./index";
import {
  type PreviewDesignOptions,
  renderProspectPreview,
} from "./preview-render";
import {
  evidence,
  previews,
  previewViewers,
  prospects,
  releaseArtifacts,
  releases,
  workspaceMemberships,
} from "./schema/index";

export type PreviewCreation =
  | { kind: "created"; previewId: string; releaseId: string; version: number }
  | { kind: "not_found" };

export function createWorkspacePreview(
  db: Database,
  userId: string,
  workspaceId: string,
  prospectId: string,
  designOptions: PreviewDesignOptions = {}
): Promise<PreviewCreation> {
  return db.transaction(async (tx): Promise<PreviewCreation> => {
    const authorized = await tx
      .select({
        name: prospects.name,
        physicalAddress: prospects.physicalAddress,
        role: workspaceMemberships.role,
        websiteUrl: prospects.websiteUrl,
      })
      .from(prospects)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(workspaceMemberships.workspaceId, prospects.workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      )
      .where(
        and(
          eq(prospects.workspaceId, workspaceId),
          eq(prospects.id, prospectId)
        )
      )
      .limit(1)
      .for("update", { of: prospects });
    const record = authorized.at(0);
    if (!(record && ["owner", "operator"].includes(record.role))) {
      return { kind: "not_found" };
    }
    const prior = await tx
      .select({ version: releases.version })
      .from(releases)
      .where(eq(releases.prospectId, prospectId))
      .orderBy(desc(releases.version))
      .limit(1);
    const version = (prior.at(0)?.version ?? 0) + 1;
    const releaseId = `release_${randomUUID()}`;
    const previewId = `preview_${randomUUID()}`;
    const [origin] = await tx
      .select({
        capturedAt: evidence.capturedAt,
        evidenceId: evidence.id,
        kind: evidence.type,
        sourceExcerpt: evidence.excerpt,
        sourceUri: evidence.sourceUri,
        title: evidence.title,
      })
      .from(evidence)
      .where(eq(evidence.prospectId, prospectId))
      .orderBy(desc(evidence.capturedAt))
      .limit(1);
    const html = renderProspectPreview({
      ...designOptions,
      designVersion: version,
      ...(origin &&
      (origin.kind === "external_source" || origin.kind === "operator_report")
        ? {
            provenance: {
              capturedAt: origin.capturedAt,
              evidenceId: origin.evidenceId,
              kind: origin.kind,
              sourceExcerpt: origin.sourceExcerpt,
              sourceUri: origin.sourceUri,
              title: origin.title,
            },
          }
        : {}),
      name: record.name,
      physicalAddress: record.physicalAddress,
      websiteUrl: record.websiteUrl,
    });
    const sha256 = createHash("sha256").update(html).digest("hex");
    await tx.insert(releases).values({
      artifactObjectKey: `release_artifacts/${releaseId}`,
      id: releaseId,
      prospectId,
      status: "draft",
      version,
    });
    await tx.insert(releaseArtifacts).values({
      html,
      prospectId,
      releaseId,
      sha256,
    });
    await tx.insert(previews).values({
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      id: previewId,
      prospectId,
      releaseId,
      state: "draft",
    });
    return { kind: "created", previewId, releaseId, version };
  });
}

/** All historical versions remain inspectable by active workspace members. */
export async function listWorkspacePreviews(
  db: Database,
  userId: string,
  workspaceId: string,
  prospectId: string
) {
  const membership = await db
    .select({ role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .limit(1);
  if (membership.length === 0) {
    return null;
  }
  return db
    .select({
      createdAt: previews.createdAt,
      expiresAt: previews.expiresAt,
      previewId: previews.id,
      releaseId: releases.id,
      sha256: releaseArtifacts.sha256,
      state: previews.state,
      version: releases.version,
    })
    .from(previews)
    .innerJoin(releases, eq(previews.releaseId, releases.id))
    .innerJoin(releaseArtifacts, eq(releaseArtifacts.releaseId, releases.id))
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
    .where(eq(prospects.id, prospectId))
    .orderBy(desc(releases.version))
    .limit(100);
}

export interface PrivatePreview {
  html: string;
  previewId: string;
  releaseId: string;
  version: number;
}

/** Workspace membership or specific reviewer ACL is required; expired previews disappear. */
export async function readPrivatePreview(
  db: Database,
  userId: string,
  workspaceId: string,
  previewId: string
): Promise<PrivatePreview | null> {
  const result = await db
    .select({
      html: releaseArtifacts.html,
      membership: workspaceMemberships.userId,
      previewId: previews.id,
      releaseId: releases.id,
      version: releases.version,
      viewer: previewViewers.viewerId,
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
    .innerJoin(releaseArtifacts, eq(releaseArtifacts.releaseId, releases.id))
    .leftJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .leftJoin(
      previewViewers,
      and(
        eq(previewViewers.previewId, previewId),
        eq(previewViewers.viewerId, userId)
      )
    )
    .where(
      and(
        eq(previews.id, previewId),
        or(
          gt(previews.expiresAt, new Date()),
          and(
            eq(previews.state, "approved"),
            eq(workspaceMemberships.userId, userId)
          )
        ),
        or(
          eq(workspaceMemberships.userId, userId),
          eq(previewViewers.viewerId, userId)
        )
      )
    )
    .limit(1);
  const row = result.at(0);
  if (!row) {
    return null;
  }
  return {
    html: row.html,
    previewId: row.previewId,
    releaseId: row.releaseId,
    version: row.version,
  };
}
