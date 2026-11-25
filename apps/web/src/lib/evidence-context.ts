export function evidenceScope(
  userId: string | undefined,
  workspaceId: string,
  prospectId: string | null
): string | null {
  return userId && workspaceId && prospectId
    ? JSON.stringify([userId, workspaceId, prospectId])
    : null;
}

export function selectScopedEvidence<T extends { scope: string }>(
  stored: T | null,
  scope: string | null
): T | null {
  return scope !== null && stored?.scope === scope ? stored : null;
}

export function sourceConfidence(
  hasExternalSource: boolean,
  providers?: readonly string[]
): { label: string; description: string } {
  if (providers?.length === 1 && providers[0] === "overture_places") {
    return {
      description:
        "Source-reported place information; current business activity and location are not independently verified.",
      label: "Overture Maps Places",
    };
  }
  if (
    providers?.length === 1 &&
    providers[0] === "minneapolis_residential_specialty"
  ) {
    return {
      description:
        "Registry evidence is sourced, but business activity and license status remain unverified.",
      label: "Historical public registry",
    };
  }
  return hasExternalSource
    ? {
        description:
          "Inspect linked evidence for the provider and reported facts.",
        label: "External source",
      }
    : {
        description:
          "Operator-provided details are unverified. Add a sourced record for enrichment.",
        label: "Operator-reported",
      };
}
