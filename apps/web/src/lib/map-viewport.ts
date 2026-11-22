/** Preserve the original map canvas state across mode changes and reloads. */
export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

export const INITIAL_MAP_VIEWPORT: Readonly<MapViewport> = {
  latitude: 44.978,
  longitude: -93.265,
  zoom: 9.8,
};

export function mapViewportStorageKey(
  userId: string,
  workspaceId: string
): string | null {
  if (!(userId && workspaceId)) {
    return null;
  }
  return `pstudio:map:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}`;
}

/** Untrusted browser storage never becomes a map position without validation. */
export function parseMapViewport(value: unknown): MapViewport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<MapViewport>;
  const { latitude, longitude, zoom } = candidate;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    typeof zoom !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(zoom) ||
    latitude < -85 ||
    latitude > 85 ||
    longitude < -180 ||
    longitude > 180 ||
    zoom < 0 ||
    zoom > 18
  ) {
    return null;
  }
  return { latitude, longitude, zoom };
}

export function readMapViewport(raw: string | null): MapViewport | null {
  if (!raw || raw.length > 200) {
    return null;
  }
  try {
    return parseMapViewport(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}
