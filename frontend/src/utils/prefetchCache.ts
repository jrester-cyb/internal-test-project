// Prefetch cache for data loading
// Stores in-flight or completed fetch promises to avoid duplicate requests

type CacheEntry<T> = {
  promise: Promise<T>
  timestamp: number
}

const cache = new Map<string, CacheEntry<any>>()
const CACHE_TTL = 30000 // 30 seconds

function cleanExpiredEntries() {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(key)
    }
  }
}

/**
 * Get or create a cached fetch promise.
 * If a fetch for this key is already in progress or recently completed, return it.
 * Otherwise, start a new fetch and cache the promise.
 */
export function getCachedFetch<T>(
  key: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  cleanExpiredEntries()

  const existing = cache.get(key)
  if (existing) {
    return existing.promise
  }

  const promise = fetchFn()
  cache.set(key, { promise, timestamp: Date.now() })

  // Clean up on error to allow retry
  promise.catch(() => {
    cache.delete(key)
  })

  return promise
}

/**
 * Invalidate a specific cache entry
 */
export function invalidateCache(key: string) {
  cache.delete(key)
}

/**
 * Invalidate all cache entries matching a prefix
 */
export function invalidateCachePrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}

/**
 * Clear entire cache
 */
export function clearCache() {
  cache.clear()
}

// Cache key builders for different data types
export const cacheKeys = {
  library: (orgId: string, workspaceId?: string, directoryId?: string) =>
    `library:${orgId}:${workspaceId || 'global'}:${directoryId || 'root'}`,

  map: (orgId: string, workspaceId?: string, zoom: number, lat: number, lng: number) =>
    `map:${orgId}:${workspaceId || 'global'}:${zoom}:${lat.toFixed(4)}:${lng.toFixed(4)}`,

  assetTypes: (orgId: string, workspaceId?: string) =>
    `assetTypes:${orgId}:${workspaceId || 'global'}`,

  assetTypeDetail: (orgId: string, workspaceId: string | undefined, assetTypeId: string) =>
    `assetTypeDetail:${orgId}:${workspaceId || 'global'}:${assetTypeId}`,

  assetsByType: (orgId: string, workspaceId: string | undefined, assetTypeId: string) =>
    `assetsByType:${orgId}:${workspaceId || 'global'}:${assetTypeId}`,

  assetAttributeDefinitions: (orgId: string, workspaceId: string | undefined, assetTypeId: string) =>
    `assetAttributeDefinitions:${orgId}:${workspaceId || 'global'}:${assetTypeId}`,

  assetAttributeDefinitionsAll: (orgId: string, workspaceId: string | undefined, assetTypeId: string) =>
    `assetAttributeDefinitionsAll:${orgId}:${workspaceId || 'global'}:${assetTypeId}`,

  assetDetail: (orgId: string, workspaceId: string | undefined, assetId: string) =>
    `assetDetail:${orgId}:${workspaceId || 'global'}:${assetId}`,

  // Security pages
  sessions: (userId: string) => `sessions:${userId}`,
  mfaDevices: () => `mfaDevices`,
  whoami: () => `whoami`,

  // Map prefetch
  assetPrefetch: (orgId: string, workspaceId: string | undefined, assetId: string) =>
    `assetPrefetch:${orgId}:${workspaceId || 'global'}:${assetId}`,

  clusterPrefetch: (orgId: string, workspaceId: string | undefined, clusterId: string, filterHash: string) =>
    `clusterPrefetch:${orgId}:${workspaceId || 'global'}:${clusterId}:${filterHash}`,

  relatedAssetsPrefetch: (orgId: string, workspaceId: string | undefined, assetId: string) =>
    `relatedAssetsPrefetch:${orgId}:${workspaceId || 'global'}:${assetId}`,
}

/**
 * Simple hash function for creating cache keys from filter objects.
 * Uses a fast string hashing algorithm (djb2).
 */
export function hashFilters(filters: any[]): string {
  if (!filters || filters.length === 0) return 'nofilters'

  const str = JSON.stringify(filters)
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}
