import {
  fetchAssetType,
  fetchAssetTypes,
  fetchAssetsByType,
  fetchAsset,
  fetchAssetAttributeDefinitions,
  fetchAllAssetAttributeDefinitions,
  type OffsetPaginatedResponse
} from '@app/api/assets'
import { getCachedFetch, cacheKeys } from '@app/utils/prefetchCache'
import type { LoaderFunctionArgs } from 'react-router-dom'
import type { AssetType, Asset, AssetTypeAttribute } from '@app/types'

const INITIAL_PAGE_SIZE = 50
const ASSETS_PAGE_SIZE = 20
const ATTRIBUTES_PAGE_SIZE = 25

// Asset Types list loader
export async function assetTypesRouteLoader({ params }: LoaderFunctionArgs): Promise<OffsetPaginatedResponse<AssetType>> {
  const { organizationId, workspaceId } = params

  if (!organizationId) {
    throw new Error('Organization ID is required')
  }

  const key = cacheKeys.assetTypes(organizationId, workspaceId)
  const data = await getCachedFetch(key, () =>
    fetchAssetTypes(organizationId, workspaceId, { limit: INITIAL_PAGE_SIZE, offset: 0 })
  )

  return {
    count: data.count || 0,
    next: data.next || null,
    previous: data.previous || null,
    results: data.results || [],
  }
}

// Asset Type detail loader
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

// Asset Grid loader - loads assets and attribute definitions
export interface AssetGridLoaderData {
  assets: Asset[]
  attributes: AssetTypeAttribute[]
  totalCount: number
  pageSize: number
  workspaceId: string | undefined
  organizationId: string
}

export async function assetGridRouteLoader({ params }: LoaderFunctionArgs): Promise<AssetGridLoaderData> {
  const { organizationId, workspaceId, assetTypeId } = params

  if (!organizationId || !assetTypeId) {
    throw new Error('Organization ID and Asset Type ID are required')
  }

  // Use cache keys for prefetch compatibility
  const assetsKey = cacheKeys.assetsByType(organizationId, workspaceId, assetTypeId)
  const attrsKey = cacheKeys.assetAttributeDefinitionsAll(organizationId, workspaceId, assetTypeId)

  const [assetsResponse, attributes] = await Promise.all([
    getCachedFetch(assetsKey, () =>
      fetchAssetsByType(organizationId, workspaceId, assetTypeId, ASSETS_PAGE_SIZE, 0)
    ),
    getCachedFetch(attrsKey, () =>
      fetchAllAssetAttributeDefinitions(organizationId, workspaceId, assetTypeId)
    ),
  ])

  return {
    assets: assetsResponse.results || [],
    attributes,
    totalCount: assetsResponse.count || 0,
    pageSize: ASSETS_PAGE_SIZE,
    workspaceId,
    organizationId,
  }
}

// Asset Attributes loader
export interface AssetAttributesLoaderData {
  initialData: AssetTypeAttribute[]
  initialNextUrl: string | null
  count: number
  assetTypeId: string
  workspaceId: string | undefined
  organizationId: string
  includeHidden: boolean
}

export async function assetAttributesRouteLoader({ params, request }: LoaderFunctionArgs): Promise<AssetAttributesLoaderData> {
  const { organizationId, workspaceId, assetTypeId } = params

  if (!organizationId || !assetTypeId) {
    throw new Error('Organization ID and Asset Type ID are required')
  }

  const url = new URL(request.url)
  const search = url.searchParams.get('search') || undefined
  const includeHidden = url.searchParams.get('include_hidden') === 'true'

  // Only use cache when no search query (prefetch won't have search params)
  const key = cacheKeys.assetAttributeDefinitions(organizationId, workspaceId, assetTypeId)

  const response = search
    ? await fetchAssetAttributeDefinitions(organizationId, workspaceId, assetTypeId, 1, ATTRIBUTES_PAGE_SIZE, { search, includeHidden })
    : await getCachedFetch(key, () =>
        fetchAssetAttributeDefinitions(organizationId, workspaceId, assetTypeId, 1, ATTRIBUTES_PAGE_SIZE, { includeHidden })
      )

  return {
    initialData: response.results || [],
    initialNextUrl: response.next || null,
    count: response.count || 0,
    assetTypeId,
    workspaceId,
    organizationId,
    includeHidden,
  }
}

// Asset Detail loader
export interface AssetDetailLoaderData {
  asset: Asset
  attributes: AssetTypeAttribute[]
  organizationId: string
  workspaceId: string | undefined
}

export async function assetDetailRouteLoader({ params }: LoaderFunctionArgs): Promise<AssetDetailLoaderData> {
  const { organizationId, workspaceId, assetTypeId, assetId } = params

  if (!organizationId || !assetTypeId || !assetId) {
    throw new Error('Organization ID, Asset Type ID, and Asset ID are required')
  }

  // Use cache keys for prefetch compatibility
  const assetKey = cacheKeys.assetDetail(organizationId, workspaceId, assetId)
  const attrsKey = cacheKeys.assetAttributeDefinitionsAll(organizationId, workspaceId, assetTypeId)

  const [asset, attributes] = await Promise.all([
    getCachedFetch(assetKey, () =>
      fetchAsset(organizationId, workspaceId, assetId)
    ),
    getCachedFetch(attrsKey, () =>
      fetchAllAssetAttributeDefinitions(organizationId, workspaceId, assetTypeId)
    ),
  ])

  return {
    asset,
    attributes,
    organizationId,
    workspaceId,
  }
}