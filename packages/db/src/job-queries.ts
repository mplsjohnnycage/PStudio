import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./index";
import { jobs, prospects, workspaceMemberships } from "./schema/index";

/** SQL-level authorization: the membership join is mandatory for every returned row. */
export function buildAuthorizedJobsQuery(
  db: Database,
  userId: string,
  workspaceId: string
) {
  return db
    .select({
      attempt: jobs.attempt,
      id: jobs.id,
      maxAttempts: jobs.maxAttempts,
      prospectId: jobs.prospectId,
      state: jobs.state,
      type: jobs.type,
    })
    .from(jobs)
    .innerJoin(prospects, eq(jobs.prospectId, prospects.id))
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, prospects.workspaceId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .where(eq(prospects.workspaceId, workspaceId))
    .orderBy(desc(jobs.createdAt))
    .limit(100);
}

/**
 * Return null for missing membership (or workspace), an array for an authorized
 * workspace. Recheck membership in the actual data query, avoiding a revoked
 * membership leaking records after preflight.
 */
export async function readWorkspaceJobs(
  db: Database,
  userId: string,
  workspaceId: string
) {
  const member = await db
    .select({ role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .limit(1);

  if (member.length === 0) {
    return null;
  }

  return buildAuthorizedJobsQuery(db, userId, workspaceId);
}
