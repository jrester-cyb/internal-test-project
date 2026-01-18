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

// Convert lat/lng to tile coordinates at a given zoom level
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom)
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return { x, y }
}

// Get tile URL for OpenStreetMap (light mode)
function getOsmTileUrl(x: number, y: number, z: number): string {
  const subdomains = ['a', 'b', 'c']
  const s = subdomains[Math.abs(x + y) % subdomains.length]
  return `https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`
}

// Get tile URL for CartoDB dark mode
function getCartoTileUrl(x: number, y: number, z: number): string {
  const subdomains = ['a', 'b', 'c', 'd']
  const s = subdomains[Math.abs(x + y) % subdomains.length]
  return `https://${s}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`
}

// Get dark mode setting from localStorage
function getIsDarkMode(): boolean {
  try {
    const saved = localStorage.getItem('darkMode')
    return saved ? JSON.parse(saved) : false
  } catch {
    return false
  }
}

// Prefetch map tiles for a given position
// This loads tiles into the browser cache so they're instant when the map renders
export function prefetchMapTiles(
  lat: number,
  lng: number,
  zoom: number,
  isDarkMode: boolean = false
): void {
  const getTileUrl = isDarkMode ? getCartoTileUrl : getOsmTileUrl
  const center = latLngToTile(lat, lng, zoom)

  // Calculate how many tiles to fetch based on typical viewport
  // Assuming ~1920x1080 viewport, tiles are 256px, so roughly 8x4 tiles
  // We'll fetch a 5x5 grid around center to cover most viewports
  const radius = 2

  const tilesToFetch: string[] = []

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const x = center.x + dx
      const y = center.y + dy
      // Validate tile coordinates
      const maxTile = Math.pow(2, zoom) - 1
      if (x >= 0 && x <= maxTile && y >= 0 && y <= maxTile) {
        tilesToFetch.push(getTileUrl(x, y, zoom))
      }
    }
  }

  // Prefetch tiles using Image objects to trigger browser fetch and cache
  tilesToFetch.forEach(url => {
    const img = new Image()
    img.src = url
  })
}

// Prefetch tiles for a saved position (if one exists)
// Automatically detects dark mode from localStorage
export function prefetchMapTilesForPosition(
  organizationId: string,
  workspaceId?: string
): void {
  const position = getMapPosition(organizationId, workspaceId)
  const isDarkMode = getIsDarkMode()

  if (position) {
    prefetchMapTiles(position.lat, position.lng, position.zoom, isDarkMode)
  } else {
    // Prefetch default position (New Orleans)
    prefetchMapTiles(29.9511, -90.0715, 10, isDarkMode)
  }
}
