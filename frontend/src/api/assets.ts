import type { SearchRequest } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:80/api'

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
  const { page = 1, limit = 50, ...restRequest } = request
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  })
  
  const response = await fetch(`${API_BASE}/assets/search/?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(restRequest)
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
