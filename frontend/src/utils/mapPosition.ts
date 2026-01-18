// Utility for storing and retrieving saved map positions per org/workspace

export interface MapPosition {
  lat: number
  lng: number
  zoom: number
}

const STORAGE_KEY_PREFIX = 'mapPosition'

function getStorageKey(organizationId: string, workspaceId?: string): string {
  return `${STORAGE_KEY_PREFIX}:${organizationId}:${workspaceId || 'global'}`
}

export function saveMapPosition(
  organizationId: string,
  workspaceId: string | undefined,
  position: MapPosition
): void {
  try {
    const key = getStorageKey(organizationId, workspaceId)
    localStorage.setItem(key, JSON.stringify(position))
  } catch {
    // Ignore storage errors
  }
}

export function getMapPosition(
  organizationId: string,
  workspaceId?: string
): MapPosition | null {
  try {
    const key = getStorageKey(organizationId, workspaceId)
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored) as MapPosition
    }
  } catch {
    // Ignore storage errors
  }
  return null
}

export function buildMapUrlWithPosition(
  basePath: string,
  organizationId: string,
  workspaceId?: string
): string {
  const position = getMapPosition(organizationId, workspaceId)
  if (position) {
    const params = new URLSearchParams()
    params.set('lat', position.lat.toFixed(6))
    params.set('lng', position.lng.toFixed(6))
    params.set('zoom', position.zoom.toString())
    return `${basePath}/map?${params.toString()}`
  }
  return `${basePath}/map`
}
