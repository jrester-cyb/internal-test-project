import { fetchAssetTypes } from '@app/api/assets'
import { getCachedFetch, cacheKeys } from '@app/utils/prefetchCache'
import type { LoaderFunctionArgs } from 'react-router-dom'

// Legacy function signature for direct calls
export async function assetTypesLoader(organizationId: string, workspaceId: string) {
  const key = cacheKeys.assetTypes(organizationId, workspaceId)
  const types = await getCachedFetch(key, () =>
    fetchAssetTypes(organizationId, workspaceId)
  )
  return Array.isArray(types) ? types : types.results || []
}

// React Router loader function
export async function assetTypesRouteLoader({ params }: LoaderFunctionArgs) {
  const { organizationId, workspaceId } = params

  if (!organizationId) {
    throw new Error('Organization ID is required')
  }

  const key = cacheKeys.assetTypes(organizationId, workspaceId)
  const data = await getCachedFetch(key, () =>
    fetchAssetTypes(organizationId, workspaceId)
  )

  return Array.isArray(data) ? data : data.results || []
}