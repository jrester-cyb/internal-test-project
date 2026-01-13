import type { SearchRequest } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:80/api'

// Helper to build workspace-scoped URLs
function workspaceUrl(workspaceId: string, path: string) {
  return `${API_BASE}/workspaces/${workspaceId}/${path}`
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

export async function fetchClusters(workspaceId: string, zoom: number, bbox?: number[], filters?: any) {
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
      body: JSON.stringify(filters)
    })
    if (!response.ok) throw new Error('Failed to fetch clusters')
    return response.json()
  } else {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Failed to fetch clusters')
    return response.json()
  }
}

export async function fetchTiles(workspaceId: string, bbox: number[], limit: number = 5000, filters?: any) {
  const params = new URLSearchParams({
    bbox: bbox.join(','),
    limit: limit.toString()
  })
  
  const url = workspaceUrl(workspaceId, `assets/tiles/?${params}`)
  
  if (filters) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(filters)
    })
    if (!response.ok) throw new Error('Failed to fetch tiles')
    return response.json()
  } else {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Failed to fetch tiles')
    return response.json()
  }
}

export async function searchAssets(workspaceId: string, request: SearchRequest) {
  const { page = 1, limit = 50, filters = [], ...restRequest } = request
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
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

export async function fetchAssetsByType(workspaceId: string, assetTypeId: string, page: number = 1, pageSize: number = 25) {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString()
  })
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/assets/?${params}`))
  if (!response.ok) throw new Error('Failed to fetch assets by type')
  return response.json()
}

export async function fetchAssetAttributeDefinitions(workspaceId: string, assetTypeId: string, page: number = 1, pageSize: number = 25, search?: string, includeHidden?: boolean) {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString()
  })

  if (search) {
    params.append('search', search)
  }

  if (includeHidden) {
    params.append('include_hidden', 'true')
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

export async function fetchGlobalAttributeDefinition(workspaceId: string, assetTypeId: string, attributeId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeId}/global-definition/`))
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

export async function fetchAttributeValues(workspaceId: string, assetTypeId: string, attributeDefinitionId: string) {
  const response = await fetch(workspaceUrl(workspaceId, `asset-types/${assetTypeId}/attributes/${attributeDefinitionId}/values/?page_size=1000`))
  if (!response.ok) throw new Error('Failed to fetch attribute values')
  const data = await response.json()
  // Return the values array directly (no longer wrapped in {value, type} objects)
  return data.results || []
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

export async function createAssetTypeAttributeChoice(workspaceId: string, assetTypeId: string, attributeId: string, data: { value: any, label: string, icon?: string, color?: string, order?: number }) {
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
