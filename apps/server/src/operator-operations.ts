import type { OperatorCommand } from "@prospect-studio/api/operator-tools";
import type { Database } from "@prospect-studio/db";
import { admitSourcedProspect } from "@prospect-studio/db/admission-queries";
import { enqueueWorkspaceJob } from "@prospect-studio/db/job-enqueue";
import { readWorkspaceJobs } from "@prospect-studio/db/job-queries";
import {
  createWorkspacePreview,
  listWorkspacePreviews,
  readPrivatePreview,
} from "@prospect-studio/db/preview-queries";
import {
  createWorkspaceProspect,
  listWorkspaceProspects,
} from "@prospect-studio/db/prospect-queries";
import {
  openWorkspaceReview,
  readWorkspaceReview,
} from "@prospect-studio/db/review-queries";
import {
  createOwnedWorkspace,
  listUserWorkspaces,
  mayDiscoverInWorkspace,
} from "@prospect-studio/db/workspace-queries";
import { searchMinneapolisLicense } from "./minneapolis-license-source";

/** Dispatch to existing functions, always retaining the bound user identity. */
export async function executeAuthorizedOperatorOperation(
  db: Database,
  userId: string,
  workspaceId: string,
  request: OperatorCommand
): Promise<unknown> {
  const { tool, input } = request;
  switch (tool) {
    case "list_workspaces":
      return { workspaces: await listUserWorkspaces(db, userId) };
    case "create_workspace":
      return createOwnedWorkspace(db, userId, input.name);
    case "list_prospects":
      return {
        prospects: await listWorkspaceProspects(db, userId, workspaceId),
      };
    case "list_jobs":
      return { jobs: await readWorkspaceJobs(db, userId, workspaceId) };
    case "create_prospect":
      return createWorkspaceProspect(db, userId, workspaceId, {
        name: input.name,
        ...(input.physicalAddress
          ? { physicalAddress: input.physicalAddress }
          : {}),
        ...(input.websiteUrl ? { websiteUrl: input.websiteUrl } : {}),
      });
    case "discover_municipal_record": {
      if (!(await mayDiscoverInWorkspace(db, userId, workspaceId))) {
        return { error: "not_found" };
      }
      const candidates = await searchMinneapolisLicense(input.query);
      const selected = input.externalId
        ? candidates.filter(
            (matched) => matched.externalId === input.externalId
          )
        : candidates;
      if (selected.length !== 1) {
        return selected.length === 0
          ? { error: "not_found" }
          : {
              error: "selection_required",
              matches: selected.map(({ externalId, name }) => ({
                externalId,
                name,
              })),
            };
      }
      const [candidate] = selected;
      if (!candidate) {
        return { error: "not_found" };
      }
      const admitted = await admitSourcedProspect(
        db,
        userId,
        workspaceId,
        candidate
      );
      return {
        ...admitted,
        recordStatus: "historical_unverified",
        sourceUri: candidate.sourceUri,
      };
    }
    case "enqueue_enrichment":
      return enqueueWorkspaceJob(
        db,
        userId,
        workspaceId,
        input.prospectId,
        input.idempotencyKey
      );
    case "list_previews":
      return {
        previews: await listWorkspacePreviews(
          db,
          userId,
          workspaceId,
          input.prospectId
        ),
      };
    case "read_preview":
      return readPrivatePreview(db, userId, workspaceId, input.previewId);
    case "create_private_preview":
      return createWorkspacePreview(db, userId, workspaceId, input.prospectId);
    case "request_review":
      return openWorkspaceReview(db, userId, workspaceId, input.previewId);
    case "read_review":
      return readWorkspaceReview(db, userId, workspaceId, input.previewId);
    default:
      return { error: "not_supported" };
  }
}
