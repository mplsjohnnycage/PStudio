import { defineDoc } from "@earendil-works/pi-durable";

/**
 * Private Pi SQLite document, scoped to ONE Rivet Actor. Unlike Pi's numeric
 * conversation ids, this identity cannot collide with another Actor.
 * The model does not have a document-write tool.
 *
 * The actor's onWake binds from c.key, which only the authenticated Neon
 * backend may address over the private Rivet control plane.
 */
export const agentIdentityDoc = defineDoc<{
  userId: string;
  workspaceId: string;
}>({
  checkpointWhen: () => true,
  initial: () => ({ userId: "", workspaceId: "" }),
  kind: "pstudio.actor.identity",
  scope: "session",
  version: 1,
});
