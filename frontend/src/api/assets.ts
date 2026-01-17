import type { SearchRequest, UnitCategory } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:80/api'

// Helper to build workspace-scoped URLs
function workspaceUrl(workspaceId: string, path: string) {
  return `${API_BASE}/workspaces/${workspaceId}/${path}`
}

// Fetch all organizations
export async function fetchOrganizations() {
  const response = await fetch(`${API_BASE}/organizations/`)
  if (!response.ok) throw new Error('Failed to fetch organizations')
  return response.json()
}

// Fetch available attribute types
export async function fetchAttributeTypes(): Promise<{ value: string; label: string }[]> {
  const response = await fetch(`${API_BASE}/attribute-types/`)
  if (!response.ok) throw new Error('Failed to fetch attribute types')
  return response.json()
}

// Unit Categories API - global endpoint (not workspace-scoped)
export async function fetchUnitCategories(search?: string, category?: string, mode?: 'full' | 'categories' | 'units'): Promise<UnitCategory[]> {
  const allCategories: UnitCategory[] = []
  const params = new URLSearchParams({ page_size: '100' })
  if (search) {
    params.append('search', search)
  }
  if (category) {
    params.append('category', category)
  }
  if (mode && mode !== 'full') {
    params.append('mode', mode)
  }
  let url: string | null = `${API_BASE}/utils/units/?${params}`
  
  while (url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Failed to fetch unit categories')
    const data = await response.json()
    allCategories.push(...data.results)
    url = data.next
  }
  
  return allCategories
}

export async function fetchWorkspaces() {
  const response = await fetch(`${API_BASE}/workspaces/`)
  if (!response.ok) throw new Error('Failed to fetch workspaces')
  return response.json()
}

export async function fetchWorkspace(workspaceId: string) {
  const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/`)
  if (!response.ok) throw new Error('Failed to fetch workspace')
  return response.json()
}

export async function fetchAsset(workspaceId: string, assetId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `assets/${assetId}/`))
  if (!response.ok) throw new Error('Failed to fetch asset')
  return response.json()
}

export interface RelatedAsset {
  id: string
  name: string
  assetType: string
  assetTypeName: string
  relatedUrl: string
  hasChildren: boolean
}

export interface RelatedAssetsResponse {
  parent: RelatedAsset | null
  siblings: RelatedAsset[]
  children: RelatedAsset[]
}

export async function fetchRelatedAssets(workspaceId: string, assetId: string): Promise<RelatedAssetsResponse> {
  const response = await fetch(workspaceUrl(workspaceId, `assets/${assetId}/related/`))
  if (!response.ok) throw new Error('Failed to fetch related assets')
  return response.json()
}

export async function fetchClusters(workspaceId: string, zoom: number, bbox?: number[], filters?: any, signal?: AbortSignal) {
  const params = new URLSearchParams({ zoom: zoom.toString() })
  if (bbox) {
    params.append('bbox', bbox.join(','))
  }

  const url = workspaceUrl(workspaceId, `assets/clusters/?${params}`)

  if (filters) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(filters),
      signal
    })
    if (!response.ok) throw new Error('Failed to fetch clusters')
    return response.json()
  } else {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error('Failed to fetch clusters')
    return response.json()
  }
}

export interface TilesResponse {
  type: 'FeatureCollection'
  features: any[]
  count: number
  total: number
  next: string | null
}

export async function fetchTiles(
  workspaceId: string,
  bbox: number[],
  limit: number = 1000,
  filters?: any,
  signal?: AbortSignal,
  offset: number = 0,
  zoom?: number
): Promise<TilesResponse> {
  const params = new URLSearchParams({
    bbox: bbox.join(','),
    limit: limit.toString(),
    offset: offset.toString()
  })

  // Add zoom parameter for server-side filtering of small geometries
  if (zoom !== undefined) {
    params.set('zoom', zoom.toString())
  }

  const url = workspaceUrl(workspaceId, `assets/tiles/?${params}`)

  if (filters) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(filters),
      signal
    })
    if (!response.ok) throw new Error('Failed to fetch tiles')
    return response.json()
  } else {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error('Failed to fetch tiles')
    return response.json()
  }
}

/**
 * Fetch tiles from a next URL (for pagination)
 */
export async function fetchTilesFromUrl(
  url: string,
  filters?: any,
  signal?: AbortSignal
): Promise<TilesResponse> {
  if (filters) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(filters),
      signal
    })
    if (!response.ok) throw new Error('Failed to fetch tiles')
    return response.json()
  } else {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error('Failed to fetch tiles')
    return response.json()
  }
}

export async function searchAssets(workspaceId: string, request: SearchRequest) {
  const { limit = 50, offset = 0, filters = [], ...restRequest } = request
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString()
  })

  // Ensure filters are sent as expected
  const payload = { ...restRequest, filters }

  const response = await fetch(workspaceUrl(workspaceId, `assets/search/?${params}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) throw new Error('Failed to search assets')
  return response.json()
}

export async function getAsset(workspaceId: string, id: string) {
  const response = await fetch(workspaceUrl(workspaceId, `assets/${id}/`))
  if (!response.ok) throw new Error('Failed to fetch asset')
  return response.json()
}

export async function interpretSearch(workspaceId: string, query: string) {
  const response = await fetch(workspaceUrl(workspaceId, `assets/interpret_search/`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  })
  
  if (!response.ok) throw new Error('Failed to interpret search')
  return response.json()
}

export async function fetchAssetTypes(workspaceId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/`))
  if (!response.ok) throw new Error('Failed to fetch asset types')
  return response.json()
}

export async function fetchAssetType(workspaceId: string, assetTypeId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/`))
  if (!response.ok) throw new Error('Failed to fetch asset type')
  return response.json()
}

export interface OffsetPaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/**
 * Fetch assets using limit/offset pagination.
 *
 * @param workspaceId - Workspace ID
 * @param assetTypeId - Asset type ID
 * @param limit - Number of results per page
 * @param offset - Offset to start from
 */
export async function fetchAssetsByType(
  workspaceId: string,
  assetTypeId: string,
  limit: number = 50,
  offset: number = 0
): Promise<OffsetPaginatedResponse<any>> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString()
  })
  const url = workspaceUrl(workspaceId, `asset-types/${assetTypeId}/assets/?${params}`)

  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch assets by type')
  return response.json()
}

export interface AttributeFilterOptions {
  search?: string
  includeHidden?: boolean
  excludeScopes?: string[]  // 'global' | 'override' | 'local'
  tags?: string[]
}

export async function fetchAssetAttributeDefinitions(
  workspaceId: string, 
  assetTypeId: string, 
  page: number = 1, 
  pageSize: number = 25, 
  options?: AttributeFilterOptions
) {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString()
  })

  if (options?.search) {
    params.append('search', options.search)
  }

  if (options?.includeHidden) {
    params.append('include_hidden', 'true')
  }

  if (options?.excludeScopes && options.excludeScopes.length > 0) {
    params.append('exclude_scope', options.excludeScopes.join(','))
  }

  if (options?.tags && options.tags.length > 0) {
    params.append('tags', options.tags.join(','))
  }

  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/?${params}`))
  if (!response.ok) throw new Error('Failed to fetch attribute definitions')
  return response.json()
}

export async function fetchAssetAttributeByApiKey(workspaceId: string, assetTypeId: string, apiKey: string) {
  const params = new URLSearchParams({
    search: apiKey,
    page_size: '1'
  })
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/?${params}`))
  if (!response.ok) throw new Error('Failed to fetch attribute')
  const data = await response.json()
  return data.results?.[0] || null
}

export async function fetchAttributeAssetCount(workspaceId: string, assetTypeId: string, attributeId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeId}/asset-count/`))
  if (!response.ok) throw new Error('Failed to fetch attribute asset count')
  return response.json()
}

export async function fetchGlobalAttributeDefinition(organizationId: string, assetTypeId: string, attributeId: string, workspaceId?: string) {
  const params = new URLSearchParams()
  if (workspaceId) {
    params.append('workspace_id', workspaceId)
  }
  const url = `${API_BASE}/organizations/${organizationId}/asset-types/${assetTypeId}/attributes/${attributeId}/${params.toString() ? '?' + params.toString() : ''}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch global definition')
  return response.json()
}

export async function fetchAssetAttributeDefinitionsFromUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch attribute definitions')
  return response.json()
}

export async function fetchAttributeTags(workspaceId: string, assetTypeId: string): Promise<string[]> {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/tags/`))
  if (!response.ok) throw new Error('Failed to fetch attribute tags')
  return response.json()
}

export async function fetchAllAssetAttributeDefinitions(workspaceId: string, assetTypeId: string) {
  const params = new URLSearchParams({
    page_size: '1000' // Fetch all attributes
  })
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/?${params}`))
  if (!response.ok) throw new Error('Failed to fetch attribute definitions')
  const data = await response.json()
  return data.results || []
}

export interface AttributeValuesResponse {
  results: any[]
  count: number
  next: string | null
  previous: string | null
}

export async function fetchAttributeValues(
  workspaceId: string,
  assetTypeId: string,
  attributeDefinitionId: string,
  options?: { limit?: number; offset?: number }
): Promise<AttributeValuesResponse> {
  const params = new URLSearchParams()
  if (options?.limit) {
    params.append('page_size', String(options.limit))
  }
  if (options?.offset) {
    // Convert offset to page number (1-indexed)
    const pageSize = options.limit || 20
    const page = Math.floor(options.offset / pageSize) + 1
    params.append('page', String(page))
  }
  const queryString = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeDefinitionId}/values/${queryString}`))
  if (!response.ok) throw new Error('Failed to fetch attribute values')
  const data = await response.json()
  return {
    results: data.results || [],
    count: data.count || 0,
    next: data.next || null,
    previous: data.previous || null
  }
}

export async function updateAssetTypeAttribute(workspaceId: string, assetTypeId: string, attributeId: string, data: any) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeId}/`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to update attribute')
  return response.json()
}

export async function deleteAssetTypeAttribute(workspaceId: string, assetTypeId: string, attributeId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeId}/`), {
    method: 'DELETE'
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.detail || 'Failed to delete attribute')
  }
  return response.ok
}

export async function hideAssetTypeAttribute(workspaceId: string, assetTypeId: string, attributeId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeId}/hide/`), {
    method: 'POST'
  })
  if (!response.ok) throw new Error('Failed to hide attribute')
  return response.json()
}

export async function unhideAssetTypeAttribute(workspaceId: string, assetTypeId: string, attributeId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeId}/unhide/`), {
    method: 'POST'
  })
  if (!response.ok) throw new Error('Failed to unhide attribute')
  return response.json()
}

export async function createAssetTypeAttribute(workspaceId: string, assetTypeId: string, data: any) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to create attribute')
  return response.json()
}

export async function reorderAssetTypeAttributes(workspaceId: string, assetTypeId: string, updates: Array<{id: string, order: number}>) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/reorder/`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  })
  if (!response.ok) throw new Error('Failed to reorder attributes')
  return response.json()
}

export async function createAssetTypeAttributeChoice(workspaceId: string, assetTypeId: string, attributeId: string, data: { value: any, icon?: string, color?: string, order?: number }) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeId}/choices/`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to create choice')
  return response.json()
}

export async function fetchAssetTypeAttributeChoices(workspaceId: string, assetTypeId: string, attributeId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeId}/choices/?page_size=1000`))
  if (!response.ok) throw new Error('Failed to fetch choices')
  const data = await response.json()
  return data.results || []
}

export async function deleteAssetTypeAttributeChoice(workspaceId: string, assetTypeId: string, attributeId: string, choiceId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeId}/choices/${choiceId}/`), {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Failed to delete choice')
  return response.ok
}

export async function reorderAssetTypeAttributeChoices(workspaceId: string, assetTypeId: string, attributeId: string, updates: Array<{id: string, order: number}>) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeId}/choices/reorder/`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  })
  if (!response.ok) throw new Error('Failed to reorder choices')
  return response.json()
}

// File Manager API

export interface FileNode {
  id: string
  name: string
  isDirectory: boolean
  resourceType: 'directory' | 'file' | 'image' | 'document' | 'video' | 'audio'
  hasChildren: boolean
  childrenUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface DirectoryResponse {
  id: string
  name: string
  parent: string | null
  isDirectory: boolean
  workspace: string
  description: string
  color: string
  icon: string
  path: string
  childrenCount: number
  hasChildren: boolean
  ancestors: Array<{ id: string; name: string }>
  createdAt: string
  updatedAt: string
  children: {
    count: number
    next: string | null
    previous: string | null
    results: FileNode[]
  }
}

export async function fetchFileTree(
  workspaceId: string, 
  directoryId?: string, 
  search?: string,
  limit?: number,
  offset?: number
): Promise<DirectoryResponse> {
  const path = directoryId ? `files/tree/${directoryId}/` : 'files/tree/'
  const params = new URLSearchParams()
  if (search) {
    params.append('search', search)
  }
  if (limit !== undefined) {
    params.append('limit', limit.toString())
  }
  if (offset !== undefined) {
    params.append('offset', offset.toString())
  }
  const url = workspaceUrl(workspaceId, path) + (params.toString() ? `?${params}` : '')
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch file tree')
  return response.json()
}

export async function createDirectory(workspaceId: string, data: { name: string, parent: string, description?: string }) {
  const response = await fetch(workspaceUrl(workspaceId, 'files/create-folder/'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to create directory')
  return response.json()
}

export async function deleteFileNode(workspaceId: string, fileId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `files/${fileId}/`), {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Failed to delete file')
  return response.ok
}

export async function renameFileNode(workspaceId: string, fileId: string, name: string) {
  const response = await fetch(workspaceUrl(workspaceId, `files/${fileId}/rename/`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name })
  })
  if (!response.ok) throw new Error('Failed to rename file')
  return response.json()
}

export async function moveFileNodes(workspaceId: string, fileIds: string[], destinationParent: string) {
  const response = await fetch(workspaceUrl(workspaceId, 'files/move/'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file_ids: fileIds, destination_parent: destinationParent })
  })
  if (!response.ok) throw new Error('Failed to move files')
  return response.json()
}

export async function updateAsset(
  workspaceId: string,
  assetId: string,
  data: {
    name?: string
    description?: string
    attributes?: Record<string, any>
    location?: { type: string; coordinates: number[] } | null
    geometry?: { type: string; coordinates: number[] } | null
  }
) {
  const response = await fetch(
    workspaceUrl(workspaceId, `assets/${assetId}/`),
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to update asset')
  }
  return response.json()
}

export async function updateAssetAttributeValue(
  workspaceId: string,
  assetTypeId: string,
  assetId: string,
  attributeId: string,
  value: any
) {
  const response = await fetch(
    workspaceUrl(workspaceId, `asset-types/${assetTypeId}/assets/${assetId}/update-attribute/`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ attribute_id: attributeId, value })
    }
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update attribute value')
  }
  return response.json()
}
