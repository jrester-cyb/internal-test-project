import type { SearchRequest } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:80/api'

export async function fetchAsset(assetId: string) {
  const response = await fetch(`${API_BASE}/assets/${assetId}/`)
  if (!response.ok) throw new Error('Failed to fetch asset')
  return response.json()
}

export async function fetchClusters(zoom: number, bbox?: number[], filters?: any) {
  const params = new URLSearchParams({ zoom: zoom.toString() })
  if (bbox) {
    params.append('bbox', bbox.join(','))
  }
  
  const url = `${API_BASE}/assets/clusters/?${params}`
  
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

export async function fetchTiles(bbox: number[], limit: number = 5000, filters?: any) {
  const params = new URLSearchParams({
    bbox: bbox.join(','),
    limit: limit.toString()
  })
  
  const url = `${API_BASE}/assets/tiles/?${params}`
  
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

export async function searchAssets(request: SearchRequest) {
  const { page = 1, limit = 50, filters = [], ...restRequest } = request
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  })

  // Ensure filters are sent as expected
  const payload = { ...restRequest, filters }

  const response = await fetch(`${API_BASE}/assets/search/?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) throw new Error('Failed to search assets')
  return response.json()
}

export async function getAsset(id: string) {
  const response = await fetch(`${API_BASE}/assets/${id}/`)
  if (!response.ok) throw new Error('Failed to fetch asset')
  return response.json()
}

export async function interpretSearch(query: string) {
  const response = await fetch(`${API_BASE}/assets/interpret_search/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  })
  
  if (!response.ok) throw new Error('Failed to interpret search')
  return response.json()
}

export async function fetchAssetTypes() {
  const response = await fetch(`${API_BASE}/asset-types/`)
  if (!response.ok) throw new Error('Failed to fetch asset types')
  return response.json()
}

export async function fetchAssetsByType(assetTypeId: string, page: number = 1, pageSize: number = 25) {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString()
  })
  const response = await fetch(`${API_BASE}/asset-types/${assetTypeId}/assets/?${params}`)
  if (!response.ok) throw new Error('Failed to fetch assets by type')
  return response.json()
}

export async function fetchAssetAttributeDefinitions(assetTypeId: string, page: number = 1, pageSize: number = 25, search?: string) {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString()
  })

  if (search) {
    params.append('search', search)
  }

  const response = await fetch(`${API_BASE}/asset-types/${assetTypeId}/attributes/?${params}`)
  if (!response.ok) throw new Error('Failed to fetch attribute definitions')
  return response.json()
}

export async function fetchAssetAttributeDefinitionsFromUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch attribute definitions')
  return response.json()
}

export async function fetchAllAssetAttributeDefinitions(assetTypeId: string) {
  const params = new URLSearchParams({
    page_size: '1000' // Fetch all attributes
  })
  const response = await fetch(`${API_BASE}/asset-types/${assetTypeId}/attributes/?${params}`)
  if (!response.ok) throw new Error('Failed to fetch attribute definitions')
  const data = await response.json()
  return data.results || []
}

export async function fetchAttributeValues(assetTypeId: string, attributeDefinitionId: string) {
  const response = await fetch(`${API_BASE}/asset-types/${assetTypeId}/attributes/${attributeDefinitionId}/values/?page_size=1000`)
  if (!response.ok) throw new Error('Failed to fetch attribute values')
  const data = await response.json()
  // Return the values array directly (no longer wrapped in {value, type} objects)
  return data.results || []
}

export async function updateAssetTypeAttribute(assetTypeId: string, attributeId: string, data: any) {
  const response = await fetch(`${API_BASE}/asset-types/${assetTypeId}/attributes/${attributeId}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to update attribute')
  return response.json()
}

export async function deleteAssetTypeAttribute(assetTypeId: string, attributeId: string) {
  const response = await fetch(`${API_BASE}/asset-types/${assetTypeId}/attributes/${attributeId}/`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Failed to delete attribute')
  return response.ok
}

export async function createAssetTypeAttribute(assetTypeId: string, data: any) {
  const response = await fetch(`${API_BASE}/asset-types/${assetTypeId}/attributes/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to create attribute')
  return response.json()
}

export async function reorderAssetTypeAttributes(assetTypeId: string, updates: Array<{id: string, order: number}>) {
  const response = await fetch(`${API_BASE}/asset-types/${assetTypeId}/attributes/reorder/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  })
  if (!response.ok) throw new Error('Failed to reorder attributes')
  return response.json()
}
