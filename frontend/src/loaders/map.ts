import { fetchClusters, fetchTiles, fetchAsset } from '@app/api/assets'
import type { LoaderFunctionArgs } from 'react-router-dom'

// Default to continental US center (approximately Kansas)
const DEFAULT_CENTER: [number, number] = [39.0, -98.0]
const DEFAULT_ZOOM = 5

export async function initialMapLoader({ params, request }: LoaderFunctionArgs) {
  const { organizationId, workspaceId } = params

  if (!organizationId) {
    throw new Error('Organization ID is required')
  }

  const url = new URL(request.url)
  const lat = parseFloat(url.searchParams.get('lat') || '') || DEFAULT_CENTER[0]
  const lng = parseFloat(url.searchParams.get('lng') || '') || DEFAULT_CENTER[1]
  const zoom = parseInt(url.searchParams.get('zoom') || '', 10) || DEFAULT_ZOOM
  const assetId = url.searchParams.get('assetId')

  const initialCenter: [number, number] = [lat, lng]
  const initialZoom = zoom

  // Calculate initial bounding box from center/zoom
  // Approximate bbox calculation for initial load
  const latDelta = 180 / Math.pow(2, zoom)
  const lngDelta = 360 / Math.pow(2, zoom)
  const bounds = [
    lng - lngDelta,
    lat - latDelta,
    lng + lngDelta,
    lat + latDelta
  ]

  let initialAssets: any[] = []
  let initialClusters: any[] = []
  let selectedAsset: any = null
  let selectedAssetAttributes: any[] = []

  try {
    // Fetch initial map data based on zoom level
    if (zoom < 12) {
      const clusterData = await fetchClusters(organizationId, workspaceId, zoom, bounds)
      const geojsonAssets: any[] = []
      const realClusters: any[] = []

      for (const c of clusterData.clusters) {
        if (c.type === 'Feature' && c.geometry && c.properties) {
          geojsonAssets.push({
            id: c.id,
            name: c.properties.name,
            assetType: c.properties.assetTypeId,
            h3Index: c.properties.h3Index,
            geometry: c.geometry
          })
        } else {
          realClusters.push(c)
        }
      }

      initialAssets = geojsonAssets
      initialClusters = realClusters
    } else {
      const tilesData = await fetchTiles(organizationId, workspaceId, bounds, 250)
      initialAssets = tilesData.features.map((f: any) => ({
        id: f.id,
        name: f.properties.name,
        assetType: f.properties.assetTypeId,
        h3Index: f.properties.h3Index,
        geometry: f.geometry
      }))
    }

    // Fetch selected asset if specified in URL
    if (assetId) {
      selectedAsset = await fetchAsset(organizationId, workspaceId, assetId)
    }
  } catch (error) {
    console.error('Error loading initial map data:', error)
  }

  return {
    initialCenter,
    initialZoom,
    initialAssets,
    initialClusters,
    selectedAsset,
    selectedAssetAttributes
  }
}
