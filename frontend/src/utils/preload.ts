// Preload functions for lazy-loaded page components
// Call these on hover/focus to start loading the JS chunk before navigation

import { getCachedFetch, cacheKeys } from './prefetchCache'
import { fetchFileTree, fetchAssetTypes, fetchAssetsByType, fetchAssetAttributeDefinitions, fetchAllAssetAttributeDefinitions } from '../api/assets'

// Page component preloaders
export const preloadAssetTypeAboutPage = () => import('../pages/AssetTypeAboutPage')
export const preloadAssetTypeAttributesPage = () => import('../pages/AssetTypeAttributesPage')
export const preloadAssetGridPage = () => import('../pages/AssetGridPage')
export const preloadAssetDetailPage = () => import('../pages/AssetDetailPage')
export const preloadMapPage = () => import('../pages/MapPage')
export const preloadLibraryPage = () => import('../pages/LibraryPage')
export const preloadAssetTypesPage = () => import('../pages/AssetTypesPage')

// Loader module preloaders
export const preloadLibraryLoader = () => import('../loaders/library')
export const preloadMapLoader = () => import('../loaders/map')
export const preloadAssetTypesLoader = () => import('../loaders/assetTypes')
export const preloadOrganizationsLoader = () => import('../loaders/organizations')
export const preloadWorkspacesLoader = () => import('../loaders/workspaces')

// Prefetch functions that load both the JS chunk AND start fetching data
// These should be called with the route params to prefetch the actual data

export function prefetchLibrary(organizationId: string, workspaceId?: string, directoryId?: string) {
  // Load JS chunks (page + loader)
  preloadLibraryPage()
  preloadLibraryLoader()

  // Start fetching data
  const key = cacheKeys.library(organizationId, workspaceId, directoryId)
  getCachedFetch(key, () => fetchFileTree(organizationId, workspaceId, directoryId, undefined, 100, 0))
}

export function prefetchAssetTypes(organizationId: string, workspaceId?: string) {
  // Load JS chunks (page + loader)
  preloadAssetTypesPage()
  preloadAssetTypesLoader()

  // Start fetching data
  const key = cacheKeys.assetTypes(organizationId, workspaceId)
  getCachedFetch(key, () => fetchAssetTypes(organizationId, workspaceId))
}

export function prefetchMap(organizationId: string, workspaceId?: string) {
  // Load JS chunks (page + loader) - map data depends on viewport which we don't know yet
  preloadMapPage()
  preloadMapLoader()
}

export function prefetchAssetTypeDetail(organizationId: string, workspaceId: string | undefined, assetTypeId: string) {
  // Load JS chunks (pages + loader)
  preloadAssetTypeAboutPage()
  preloadAssetTypeAttributesPage()
  preloadAssetTypesLoader()

  // Start fetching data
  const key = cacheKeys.assetTypeDetail(organizationId, workspaceId, assetTypeId)
  getCachedFetch(key, () => import('../api/assets').then(({ fetchAssetType }) =>
    fetchAssetType(organizationId, workspaceId, assetTypeId)
  ))
}

export function prefetchAssetGrid(organizationId: string, workspaceId: string | undefined, assetTypeId: string) {
  // Load JS chunks (page + loader)
  preloadAssetGridPage()
  preloadAssetTypesLoader()

  // Start fetching assets
  const assetsKey = cacheKeys.assetsByType(organizationId, workspaceId, assetTypeId)
  getCachedFetch(assetsKey, () => fetchAssetsByType(organizationId, workspaceId, assetTypeId, 20, 0))

  // Start fetching all attribute definitions (needed for grid columns)
  const attrsKey = cacheKeys.assetAttributeDefinitionsAll(organizationId, workspaceId, assetTypeId)
  getCachedFetch(attrsKey, () => fetchAllAssetAttributeDefinitions(organizationId, workspaceId, assetTypeId))
}

export function prefetchAssetAttributes(organizationId: string, workspaceId: string | undefined, assetTypeId: string) {
  // Load JS chunks (page + loader)
  preloadAssetTypeAttributesPage()
  preloadAssetTypesLoader()

  // Start fetching attribute definitions (first page)
  const key = cacheKeys.assetAttributeDefinitions(organizationId, workspaceId, assetTypeId)
  getCachedFetch(key, () => fetchAssetAttributeDefinitions(organizationId, workspaceId, assetTypeId, 1, 25))
}

export function prefetchAssetDetail(organizationId: string, workspaceId: string | undefined, assetTypeId: string, assetId: string) {
  // Load JS chunks (page + loader)
  preloadAssetDetailPage()
  preloadAssetTypesLoader()

  // Start fetching asset data
  const assetKey = cacheKeys.assetDetail(organizationId, workspaceId, assetId)
  getCachedFetch(assetKey, () => import('../api/assets').then(({ fetchAsset }) =>
    fetchAsset(organizationId, workspaceId, assetId)
  ))

  // Also prefetch attribute definitions (needed for the detail page)
  const attrsKey = cacheKeys.assetAttributeDefinitionsAll(organizationId, workspaceId, assetTypeId)
  getCachedFetch(attrsKey, () => fetchAllAssetAttributeDefinitions(organizationId, workspaceId, assetTypeId))
}
