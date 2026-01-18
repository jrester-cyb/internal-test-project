// Preload functions for lazy-loaded page components
// Call these on hover/focus to start loading the JS chunk before navigation

import { getCachedFetch, cacheKeys } from './prefetchCache'
import { fetchFileTree, fetchAssetTypes, fetchAssetsByType, fetchAssetAttributeDefinitions, fetchAllAssetAttributeDefinitions } from '../api/assets'
import { prefetchMapTilesForPosition } from './mapPosition'
import {
  preloadMapLoader,
  preloadAssetTypesLoader,
  preloadLibraryLoader,
  preloadAssetTypeDetailLoader,
  preloadAssetGridLoader,
  preloadAssetAttributesLoader,
  preloadAssetDetailLoader,
} from '../router'

// Track which pages have been preloaded (JS chunks loaded)
const preloadedPages = new Set<string>()

// Page component preloaders
export const preloadAssetTypeAboutPage = () => import('../pages/AssetTypeAboutPage')
export const preloadAssetTypeAttributesPage = () => import('../pages/AssetTypeAttributesPage')
export const preloadAssetGridPage = () => import('../pages/AssetGridPage')
export const preloadAssetDetailPage = () => import('../pages/AssetDetailPage')
export const preloadMapPage = () => import('../pages/MapPage')
export const preloadLibraryPage = () => import('../pages/LibraryPage')
export const preloadAssetTypesPage = () => import('../pages/AssetTypesPage')

// Prefetch functions that load both the JS chunk AND start fetching data
// These should be called with the route params to prefetch the actual data

export function prefetchLibrary(organizationId: string, workspaceId?: string, directoryId?: string) {
  // Load JS chunks (page) and warm up cached lazy loader
  preloadLibraryPage()
  preloadLibraryLoader()

  // Start fetching data
  const key = cacheKeys.library(organizationId, workspaceId, directoryId)
  getCachedFetch(key, () => fetchFileTree(organizationId, workspaceId, directoryId, undefined, 100, 0))
}

export function prefetchAssetTypes(organizationId: string, workspaceId?: string) {
  // Load JS chunks (page) and warm up cached lazy loader
  preloadAssetTypesPage()
  preloadAssetTypesLoader()

  // Start fetching data
  const key = cacheKeys.assetTypes(organizationId, workspaceId)
  getCachedFetch(key, () => fetchAssetTypes(organizationId, workspaceId, {}))
}

export function prefetchMap(organizationId: string, workspaceId?: string) {
  // Load JS chunks (page) and warm up cached lazy loader
  preloadMapPage().then(() => preloadedPages.add('map'))
  preloadMapLoader()

  // Prefetch map tiles for the saved position (or default)
  // This loads tiles into browser cache so they appear instantly
  prefetchMapTilesForPosition(organizationId, workspaceId)
}

// Check if the map page has been preloaded
export function isMapPreloaded(): boolean {
  return preloadedPages.has('map')
}

export function prefetchAssetTypeDetail(organizationId: string, workspaceId: string | undefined, assetTypeId: string) {
  // Load JS chunks (pages) and warm up cached lazy loader
  preloadAssetTypeAboutPage()
  preloadAssetTypeAttributesPage()
  preloadAssetTypeDetailLoader()

  // Start fetching data
  const key = cacheKeys.assetTypeDetail(organizationId, workspaceId, assetTypeId)
  getCachedFetch(key, () => import('../api/assets').then(({ fetchAssetType }) =>
    fetchAssetType(organizationId, workspaceId, assetTypeId)
  ))
}

export function prefetchAssetGrid(organizationId: string, workspaceId: string | undefined, assetTypeId: string) {
  // Load JS chunks (page) and warm up cached lazy loader
  preloadAssetGridPage()
  preloadAssetGridLoader()

  // Start fetching assets
  const assetsKey = cacheKeys.assetsByType(organizationId, workspaceId, assetTypeId)
  getCachedFetch(assetsKey, () => fetchAssetsByType(organizationId, workspaceId, assetTypeId, 20, 0))

  // Start fetching all attribute definitions (needed for grid columns)
  const attrsKey = cacheKeys.assetAttributeDefinitionsAll(organizationId, workspaceId, assetTypeId)
  getCachedFetch(attrsKey, () => fetchAllAssetAttributeDefinitions(organizationId, workspaceId, assetTypeId))
}

export function prefetchAssetAttributes(organizationId: string, workspaceId: string | undefined, assetTypeId: string) {
  // Load JS chunks (page) and warm up cached lazy loader
  preloadAssetTypeAttributesPage()
  preloadAssetAttributesLoader()

  // Start fetching attribute definitions (first page)
  const key = cacheKeys.assetAttributeDefinitions(organizationId, workspaceId, assetTypeId)
  getCachedFetch(key, () => fetchAssetAttributeDefinitions(organizationId, workspaceId, assetTypeId, 1, 25))
}

export function prefetchAssetDetail(organizationId: string, workspaceId: string | undefined, assetTypeId: string, assetId: string) {
  // Load JS chunks (page) and warm up cached lazy loader
  preloadAssetDetailPage()
  preloadAssetDetailLoader()

  // Start fetching asset data
  const assetKey = cacheKeys.assetDetail(organizationId, workspaceId, assetId)
  getCachedFetch(assetKey, () => import('../api/assets').then(({ fetchAsset }) =>
    fetchAsset(organizationId, workspaceId, assetId)
  ))

  // Also prefetch attribute definitions (needed for the detail page)
  const attrsKey = cacheKeys.assetAttributeDefinitionsAll(organizationId, workspaceId, assetTypeId)
  getCachedFetch(attrsKey, () => fetchAllAssetAttributeDefinitions(organizationId, workspaceId, assetTypeId))
}
