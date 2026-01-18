import { fetchAssetTypes, type OffsetPaginatedResponse } from '@app/api/assets'
import { getCachedFetch, cacheKeys } from '@app/utils/prefetchCache'
import type { LoaderFunctionArgs } from 'react-router-dom'
import type { AssetType } from '@app/types'

const INITIAL_PAGE_SIZE = 50

// Legacy function signature for direct calls - returns unwrapped array
export async function assetTypesLoader(organizationId: string, workspaceId: string) {
  const key = cacheKeys.assetTypes(organizationId, workspaceId)
  const data = await getCachedFetch(key, () =>
    fetchAssetTypes(organizationId, workspaceId, INITIAL_PAGE_SIZE, 0)
  )
  return data.results || []
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