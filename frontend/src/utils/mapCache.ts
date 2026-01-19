// Map data cache for tiles and clusters
// Caches fetched data by region to enable instant panning within cached areas

import type { Asset, Cluster } from '@app/types'

interface CachedRegion {
  bbox: [number, number, number, number] // [minLon, minLat, maxLon, maxLat]
  zoom: number
  assets: Asset[]
  clusters: Cluster[]
  timestamp: number
  filterHash: string
}

// Cache configuration
const MAX_CACHED_REGIONS = 20  // Increased for zoom level prefetching
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const OVERFETCH_FACTOR = 1.5 // Fetch 1.5x the viewport size
const ZOOM_PREFETCH_RANGE = 2 // Prefetch +/- 2 zoom levels

// In-memory cache
const regionCache: CachedRegion[] = []

// Track pending prefetch requests to avoid duplicates
const pendingPrefetches = new Set<string>()

/**
 * Expand a bbox by a factor to overfetch surrounding area
 */
export function expandBbox(
  bbox: [number, number, number, number],
  factor: number = OVERFETCH_FACTOR
): [number, number, number, number] {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const lonRange = maxLon - minLon
  const latRange = maxLat - minLat
  const lonPadding = (lonRange * (factor - 1)) / 2
  const latPadding = (latRange * (factor - 1)) / 2

  return [
    Math.max(-180, minLon - lonPadding),
    Math.max(-90, minLat - latPadding),
    Math.min(180, maxLon + lonPadding),
    Math.min(90, maxLat + latPadding)
  ]
}

/**
 * Check if a bbox is fully contained within another bbox
 */
function bboxContains(
  outer: [number, number, number, number],
  inner: [number, number, number, number]
): boolean {
  return (
    inner[0] >= outer[0] && // minLon
    inner[1] >= outer[1] && // minLat
    inner[2] <= outer[2] && // maxLon
    inner[3] <= outer[3]    // maxLat
  )
}

/**
 * Filter assets that fall within a bbox
 */
function filterAssetsByBbox(
  assets: Asset[],
  bbox: [number, number, number, number]
): Asset[] {
  const [minLon, minLat, maxLon, maxLat] = bbox

  return assets.filter(asset => {
    if (!asset.geometry) return false

    // Get a representative point for the geometry
    let lon: number, lat: number

    if (asset.geometry.type === 'Point') {
      [lon, lat] = asset.geometry.coordinates as [number, number]
    } else if (asset.geometry.type === 'Polygon' || asset.geometry.type === 'MultiPolygon') {
      // Use first coordinate of first ring
      const coords = asset.geometry.type === 'Polygon'
        ? asset.geometry.coordinates[0][0]
        : asset.geometry.coordinates[0][0][0]
      ;[lon, lat] = coords as [number, number]
    } else if (asset.geometry.type === 'LineString' || asset.geometry.type === 'MultiLineString') {
      // Use first coordinate
      const coords = asset.geometry.type === 'LineString'
        ? asset.geometry.coordinates[0]
        : asset.geometry.coordinates[0][0]
      ;[lon, lat] = coords as [number, number]
    } else {
      return true // Include unknown geometry types
    }

    return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
  })
}

/**
 * Filter clusters that fall within a bbox
 */
function filterClustersByBbox(
  clusters: Cluster[],
  bbox: [number, number, number, number]
): Cluster[] {
  const [minLon, minLat, maxLon, maxLat] = bbox

  return clusters.filter(cluster => {
    if (!cluster.center) return false
    const { lat, lon } = cluster.center
    return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
  })
}

/**
 * Simple hash for filter objects
 */
export function hashFilters(filters: any): string {
  if (!filters) return 'none'
  return JSON.stringify(filters)
}

/**
 * Find a cached region that contains the requested bbox
 */
export function findCachedRegion(
  bbox: [number, number, number, number],
  zoom: number,
  filterHash: string
): CachedRegion | null {
  const now = Date.now()

  // Clean expired entries
  for (let i = regionCache.length - 1; i >= 0; i--) {
    if (now - regionCache[i].timestamp > CACHE_TTL_MS) {
      regionCache.splice(i, 1)
    }
  }

  // Find a region that contains our bbox at the same zoom level with same filters
  for (const region of regionCache) {
    if (
      region.zoom === zoom &&
      region.filterHash === filterHash &&
      bboxContains(region.bbox, bbox)
    ) {
      // Update timestamp (LRU behavior)
      region.timestamp = now
      return region
    }
  }

  return null
}

/**
 * Get cached data for a bbox, filtering to only include items in the requested area
 */
export function getCachedData(
  bbox: [number, number, number, number],
  zoom: number,
  filterHash: string
): { assets: Asset[], clusters: Cluster[] } | null {
  const region = findCachedRegion(bbox, zoom, filterHash)
  if (!region) return null

  return {
    assets: filterAssetsByBbox(region.assets, bbox),
    clusters: filterClustersByBbox(region.clusters, bbox)
  }
}

/**
 * Store fetched data in the cache
 */
export function cacheRegion(
  bbox: [number, number, number, number],
  zoom: number,
  filterHash: string,
  assets: Asset[],
  clusters: Cluster[]
): void {
  // Remove any existing region with the same parameters
  const existingIndex = regionCache.findIndex(
    r => r.zoom === zoom &&
         r.filterHash === filterHash &&
         r.bbox[0] === bbox[0] &&
         r.bbox[1] === bbox[1] &&
         r.bbox[2] === bbox[2] &&
         r.bbox[3] === bbox[3]
  )

  if (existingIndex !== -1) {
    regionCache.splice(existingIndex, 1)
  }

  // Add new region
  regionCache.push({
    bbox,
    zoom,
    assets,
    clusters,
    timestamp: Date.now(),
    filterHash
  })

  // Evict oldest if over limit
  while (regionCache.length > MAX_CACHED_REGIONS) {
    // Find oldest
    let oldestIdx = 0
    for (let i = 1; i < regionCache.length; i++) {
      if (regionCache[i].timestamp < regionCache[oldestIdx].timestamp) {
        oldestIdx = i
      }
    }
    regionCache.splice(oldestIdx, 1)
  }
}

/**
 * Invalidate all cached regions (e.g., when filters change)
 */
export function invalidateMapCache(): void {
  regionCache.length = 0
}

/**
 * Invalidate cached regions for a specific filter hash
 */
export function invalidateMapCacheForFilters(filterHash: string): void {
  for (let i = regionCache.length - 1; i >= 0; i--) {
    if (regionCache[i].filterHash === filterHash) {
      regionCache.splice(i, 1)
    }
  }
}

/**
 * Get zoom levels to prefetch (adjacent to current zoom)
 */
export function getZoomLevelsToPrefetch(currentZoom: number): number[] {
  const levels: number[] = []
  for (let delta = 1; delta <= ZOOM_PREFETCH_RANGE; delta++) {
    if (currentZoom - delta >= 0) levels.push(currentZoom - delta)
    if (currentZoom + delta <= 20) levels.push(currentZoom + delta)
  }
  return levels
}

/**
 * Check if a zoom level needs prefetching for a given bbox
 */
export function needsPrefetch(
  bbox: [number, number, number, number],
  zoom: number,
  filterHash: string
): boolean {
  const key = `${zoom}:${filterHash}:${bbox.join(',')}`
  if (pendingPrefetches.has(key)) return false
  return findCachedRegion(bbox, zoom, filterHash) === null
}

/**
 * Mark a prefetch as started
 */
export function markPrefetchStarted(
  bbox: [number, number, number, number],
  zoom: number,
  filterHash: string
): void {
  const key = `${zoom}:${filterHash}:${bbox.join(',')}`
  pendingPrefetches.add(key)
}

/**
 * Mark a prefetch as completed
 */
export function markPrefetchCompleted(
  bbox: [number, number, number, number],
  zoom: number,
  filterHash: string
): void {
  const key = `${zoom}:${filterHash}:${bbox.join(',')}`
  pendingPrefetches.delete(key)
}
