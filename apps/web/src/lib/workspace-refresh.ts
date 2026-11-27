/** Suppress both fulfilled and rejected results from an obsolete workspace request. */
export async function settleWorkspaceRefresh<T>(
  request: Promise<T>,
  isCurrent: () => boolean
): Promise<T | undefined> {
  try {
    const result = await request;
    return isCurrent() ? result : undefined;
  } catch (error) {
    if (isCurrent()) {
      throw error;
    }
    return undefined;
  }
}
