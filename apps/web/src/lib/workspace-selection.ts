/**
 * The API list is the authority for workspace membership. A saved selection
 * is a UI preference, never a way to grant or infer workspace access.
 */
export function selectAccessibleWorkspace(
  workspaces: readonly { id: string }[],
  currentId: string,
  rememberedId: string
): string {
  if (currentId && workspaces.some((workspace) => workspace.id === currentId)) {
    return currentId;
  }
  if (
    rememberedId &&
    workspaces.some((workspace) => workspace.id === rememberedId)
  ) {
    return rememberedId;
  }
  return workspaces.at(0)?.id ?? "";
}

/** Invitation-only staging must not advertise workspace creation. */
export function workspaceCreationAllowed(inviteOnlyFlag?: string): boolean {
  return inviteOnlyFlag !== "1";
}

/** Scope private workspace data to the signed-in user and verified membership. */
export function workspaceDataScope(
  userId: string | undefined,
  loadedUserId: string,
  workspaceId: string,
  workspaces: readonly { id: string }[]
): string | null {
  if (
    !userId ||
    userId !== loadedUserId ||
    !workspaceId ||
    !workspaces.some((workspace) => workspace.id === workspaceId)
  ) {
    return null;
  }
  return JSON.stringify([userId, workspaceId]);
}

export function selectScopedWorkspaceData<T extends { scope: string }>(
  data: T | null,
  scope: string | null
): T | null {
  return scope && data?.scope === scope ? data : null;
}
