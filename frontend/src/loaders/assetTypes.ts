import { fetchAssetType, fetchAssetTypes, type OffsetPaginatedResponse } from '@app/api/assets'
import { getCachedFetch, cacheKeys } from '@app/utils/prefetchCache'
import type { LoaderFunctionArgs } from 'react-router-dom'
import type { AssetType } from '@app/types'

const INITIAL_PAGE_SIZE = 50

export async function assetTypeDetailLoader(organizationId: string, workspaceId: string, assetTypeId: string) {
  const key = cacheKeys.assetTypeDetail(organizationId, workspaceId, assetTypeId)
  const data = await getCachedFetch(key, () =>
    fetchAssetType(organizationId, workspaceId, assetTypeId)
  )
  return data.results || []
}

export async function assetTypeDetailRouteLoader({ params }: LoaderFunctionArgs): Promise<AssetType> {
  const { organizationId, workspaceId, assetTypeId } = params

  if (!organizationId || !assetTypeId) {
    throw new Error('Organization ID and Asset Type ID are required')
  }

  const key = cacheKeys.assetTypeDetail(organizationId, workspaceId, assetTypeId)
  const data = await getCachedFetch(key, () =>
    fetchAssetType(organizationId, workspaceId, assetTypeId)
  )

  return data
}

// React Router loader function - returns paginated response for virtualized list
export async function assetTypesRouteLoader({ params }: LoaderFunctionArgs): Promise<OffsetPaginatedResponse<AssetType>> {
  const { organizationId, workspaceId } = params

  if (!organizationId) {
    throw new Error('Organization ID is required')
  }

  const key = cacheKeys.assetTypes(organizationId, workspaceId)
  const data = await getCachedFetch(key, () =>
    fetchAssetTypes(organizationId, workspaceId, INITIAL_PAGE_SIZE, 0)
  )

  // Ensure we return the paginated response structure
  return {
    count: data.count || 0,
    next: data.next || null,
    previous: data.previous || null,
    results: data.results || [],
  }
}