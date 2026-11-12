import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Database } from "./index";
import {
  agentSessions,
  agentUiEvents,
  prospects,
  workspaceMemberships,
} from "./schema/index";

type ClientCommand =
  | {
      tool: "navigate";
      input: { view: "map" | "calendar" | "inbox" | "studio" };
    }
  | { tool: "select_prospect"; input: { prospectId: string } };

/**
 * Only an already JWT-authenticated backend may bind an Actor conversation.
 * Existing mappings cannot be taken over by a different identity or tenant.
 */
/** Stable ID for one actor keyed by authenticated Neon user and workspace. */
export function agentSessionId(userId: string, workspaceId: string): string {
  return `agent_${createHash("sha256")
    .update(JSON.stringify([userId, workspaceId]))
    .digest("hex")
    .slice(0, 48)}`;
}

export function bindAgentSession(
  db: Database,
  userId: string,
  workspaceId: string
): Promise<"bound" | "unauthorized" | "conflict"> {
  const conversationId = agentSessionId(userId, workspaceId);
  return db.transaction(async (tx) => {
    const [membership] = await tx
      .select({ role: workspaceMemberships.role })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      )
      .limit(1);
    if (!membership) {
      return "unauthorized" as const;
    }
    await tx
      .insert(agentSessions)
      .values({
        id: conversationId,
        userId,
        workspaceId,
      })
      .onConflictDoNothing();
    const [row] = await tx
      .select({
        userId: agentSessions.userId,
        workspaceId: agentSessions.workspaceId,
      })
      .from(agentSessions)
      .where(eq(agentSessions.id, conversationId))
      .limit(1);
    return row?.userId === userId && row.workspaceId === workspaceId
      ? ("bound" as const)
      : ("conflict" as const);
  });
}

/** Revocation is immediate: membership is joined on each tool call. */
export async function readAgentSession(
  db: Database,
  conversationId: string
): Promise<{ userId: string; workspaceId: string; role: string } | null> {
  const [row] = await db
    .select({
      role: workspaceMemberships.role,
      userId: agentSessions.userId,
      workspaceId: agentSessions.workspaceId,
    })
    .from(agentSessions)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(agentSessions.userId, workspaceMemberships.userId),
        eq(agentSessions.workspaceId, workspaceMemberships.workspaceId)
      )
    )
    .where(eq(agentSessions.id, conversationId))
    .limit(1);
  return row ?? null;
}

/** Persist a command that causes the dashboard to move, never direct DOM access. */
export async function appendAgentUiEvent(
  db: Database,
  userId: string,
  workspaceId: string,
  command: ClientCommand
): Promise<{ kind: "saved"; eventId: string } | { kind: "not_found" }> {
  const conversationId = agentSessionId(userId, workspaceId);
  const binding = await readAgentSession(db, conversationId);
  if (!binding) {
    return { kind: "not_found" };
  }
  if (command.tool === "select_prospect") {
    const [visible] = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(
        and(
          eq(prospects.id, command.input.prospectId),
          eq(prospects.workspaceId, binding.workspaceId)
        )
      )
      .limit(1);
    if (!visible) {
      return { kind: "not_found" };
    }
  }
  const eventId = `agent_event_${randomUUID()}`;
  await db.insert(agentUiEvents).values({
    id: eventId,
    prospectId:
      command.tool === "select_prospect" ? command.input.prospectId : null,
    sessionId: conversationId,
    type: command.tool,
    view: command.tool === "navigate" ? command.input.view : null,
    workspaceId: binding.workspaceId,
  });
  return { eventId, kind: "saved" };
}

/** UI polling endpoint; scoped to current authenticated workspace membership. */
export async function listWorkspaceAgentEvents(
  db: Database,
  userId: string,
  workspaceId: string,
  after: Date
) {
  const [membership] = await db
    .select({ role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .limit(1);
  if (!membership) {
    return null;
  }
  const latest = await db
    .select({
      createdAt: agentUiEvents.createdAt,
      id: agentUiEvents.id,
      prospectId: agentUiEvents.prospectId,
      type: agentUiEvents.type,
      view: agentUiEvents.view,
    })
    .from(agentUiEvents)
    .where(
      and(
        eq(agentUiEvents.workspaceId, workspaceId),
        eq(agentUiEvents.sessionId, agentSessionId(userId, workspaceId)),
        gt(agentUiEvents.createdAt, after)
      )
    )
    .orderBy(desc(agentUiEvents.createdAt), desc(agentUiEvents.id))
    .limit(100);
  return latest.reverse();
}
