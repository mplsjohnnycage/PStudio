import { operatorCommandSchema } from "@prospect-studio/api/operator-tools";
import type { Database } from "@prospect-studio/db";
import {
  agentSessionId,
  appendAgentUiEvent,
  readAgentSession,
} from "@prospect-studio/db/agent-session-queries";
import { executeAuthorizedOperatorOperation } from "../../server/src/operator-operations";

/**
 * Durable agent tool executor. Identity comes exclusively from the already
 * authenticated, immutable conversation binding, not model arguments.
 *
 * It calls the same DB permission-checked functions as the dashboard's HTTP
 * routes; no direct SQL, shell, publishing or outbound messaging capability.
 */
export async function executeBoundOperatorCommand(
  db: Database,
  binding: { userId: string; workspaceId: string },
  raw: unknown
): Promise<unknown> {
  const parsed = operatorCommandSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "invalid_input" };
  }
  const command = parsed.data;
  // The actor key binds identity; each call rechecks membership for revocation.
  const current = await readAgentSession(
    db,
    agentSessionId(binding.userId, binding.workspaceId)
  );
  if (!current) {
    return { error: "not_authorized" };
  }
  if (
    "workspaceId" in command.input &&
    command.input.workspaceId !== current.workspaceId
  ) {
    return { error: "not_found" };
  }
  if (command.tool === "decide_review") {
    return {
      error: "owner_confirmation_required",
      message: "Request a human owner decision in the dashboard.",
    };
  }
  if (command.tool === "navigate" || command.tool === "select_prospect") {
    return appendAgentUiEvent(db, binding.userId, binding.workspaceId, command);
  }
  return executeAuthorizedOperatorOperation(
    db,
    current.userId,
    current.workspaceId,
    command
  );
}
