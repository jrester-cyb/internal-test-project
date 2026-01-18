// Preload functions for lazy-loaded page components
// Call these on hover/focus to start loading the JS chunk before navigation

import { getCachedFetch, cacheKeys } from './prefetchCache'
import { fetchFileTree, fetchAssetTypes } from '../api/assets'

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
  // Load JS chunk
  preloadLibraryPage()

  // Start fetching data
  const key = cacheKeys.library(organizationId, workspaceId, directoryId)
  getCachedFetch(key, () => fetchFileTree(organizationId, workspaceId, directoryId, undefined, 100, 0))
}

export function prefetchAssetTypes(organizationId: string, workspaceId?: string) {
  // Load JS chunk
  preloadAssetTypesPage()

  // Start fetching data
  const key = cacheKeys.assetTypes(organizationId, workspaceId)
  getCachedFetch(key, () => fetchAssetTypes(organizationId, workspaceId))
}

export function prefetchMap(organizationId: string, workspaceId?: string) {
  // Load JS chunk only - map data depends on viewport which we don't know yet
  preloadMapPage()
}

export function prefetchAssetTypeDetail(organizationId: string, workspaceId: string | undefined, assetTypeId: string) {
  // Load JS chunk
  preloadAssetTypeAboutPage()
  preloadAssetTypeAttributesPage()

  // Start fetching data
  const key = cacheKeys.assetTypeDetail(organizationId, workspaceId, assetTypeId)
  getCachedFetch(key, () => import('../api/assets').then(({ fetchAssetType }) =>
    fetchAssetType(organizationId, workspaceId, assetTypeId)
  ))
}