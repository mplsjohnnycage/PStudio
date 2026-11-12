import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "./index";
import { workspaceMemberships, workspaces } from "./schema/index";

export function listUserWorkspaces(db: Database, userId: string) {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: workspaceMemberships.role,
    })
    .from(workspaces)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaces.id, workspaceMemberships.workspaceId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .orderBy(asc(workspaces.name))
    .limit(100);
}

/** Self-enrolls in a fresh empty workspace only; never grants access to existing workspaces. */
export function createOwnedWorkspace(
  db: Database,
  userId: string,
  name: string
) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: workspaceMemberships.workspaceId })
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.userId, userId))
      .limit(11);
    if (existing.length >= 10) {
      return { kind: "limit_reached" as const };
    }
    const id = `workspace_${randomUUID()}`;
    await tx.insert(workspaces).values({ id, name });
    await tx
      .insert(workspaceMemberships)
      .values({ role: "owner", userId, workspaceId: id });
    return { id, kind: "created" as const };
  });
}
