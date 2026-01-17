import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useLoaderData } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { fetchClusters, fetchTiles } from '../api/assets'
import type { Asset, Cluster } from '../types'
import type { AttributeFilter } from '../components/FilterBuilder'
import { MapProvider, useMapContext } from '../contexts/MapContext'
import MapView from '../components/MapView'
import MapEvents from '../components/MapEvents'

// Fix for default marker icon in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Inner component that can access MapContext
function MapPageContent({ workspaceId, loaderData, flyToLocation, onBoundsChange }: {
  workspaceId: string
  loaderData: {
    initialCenter: [number, number]
    initialZoom: number
    initialAssets: any[]
    initialClusters: any[]
    selectedAsset: any
    selectedAssetAttributes: any[]
  } | null
  flyToLocation: { coords: [number, number]; zoom: number } | null
  onBoundsChange: (bounds: number[] | null) => void
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { selectedAssetTypes, attributeFilters, nameFilter } = useMapContext()

  const [center, setCenter] = useState<[number, number]>(loaderData?.initialCenter || [29.9511, -90.0715])
  const [zoom, setZoom] = useState(loaderData?.initialZoom || 10)
  const [assets, setAssets] = useState<any[]>(loaderData?.initialAssets || [])
  const [clusters, setClusters] = useState<any[]>(loaderData?.initialClusters || [])
  const [activeFilters] = useState<any>(null)

  const initialUrlUpdateDone = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadMapData = useCallback(async (bounds: number[], zoom: number, filters?: any) => {
    if (!workspaceId) return

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    onBoundsChange(bounds)

    try {
      let mergedFilters = filters ? { ...filters } : null
      const filterGroups: any[] = []

      if (nameFilter.trim()) {
        filterGroups.push({
          field: 'name',
          value: nameFilter.trim(),
          operator: 'icontains'
        })
      }

      const attributesByType: Record<string, any[]> = {}
      attributeFilters.forEach(af => {
        if (!attributesByType[af.assetTypeId]) {
          attributesByType[af.assetTypeId] = []
        }
        attributesByType[af.assetTypeId].push({
          field: `attributes.${af.attributeKey}`,
          value: af.value,
          operator: af.operator
        })
      })

      if (selectedAssetTypes.length > 0) {
        selectedAssetTypes.forEach(typeId => {
          const typeFilters: any[] = [
            { field: 'assetTypeId', value: typeId, operator: 'exact' }
          ]
          if (attributesByType[typeId]) {
            typeFilters.push(...attributesByType[typeId])
          }
          if (typeFilters.length === 1) {
            filterGroups.push(typeFilters[0])
          } else {
            filterGroups.push({ logic: 'AND', filters: typeFilters })
          }
        })
      }

      if (filterGroups.length > 0) {
        if (mergedFilters && mergedFilters.filters) {
          mergedFilters = {
            ...mergedFilters,
            filters: [...mergedFilters.filters, ...filterGroups],
            logic: 'AND'
          }
        } else {
          mergedFilters = {
            filters: filterGroups,
            logic: selectedAssetTypes.length > 1 ? 'OR' : 'AND'
          }
        }
      }

      if (zoom < 12) {
        const clusterData = await fetchClusters(workspaceId, zoom, bounds, mergedFilters, abortController.signal)
        const geojsonAssets: Asset[] = []
        const realClusters: Cluster[] = []
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
        setClusters(realClusters)
        setAssets(geojsonAssets)
      } else {
        const tileData = await fetchTiles(workspaceId, bounds, 5000, mergedFilters, abortController.signal)
        setAssets(tileData.features.map((f: any) => ({
          id: f.id,
          name: f.properties.name,
          assetType: f.properties.assetTypeId,
          h3Index: f.properties.h3Index,
          geometry: f.geometry
        })))
        setClusters([])
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      console.error('Error loading map data:', error)
    }
  }, [workspaceId, selectedAssetTypes, attributeFilters, nameFilter, onBoundsChange])

  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('lat', center[0].toFixed(6))
    newSearchParams.set('lng', center[1].toFixed(6))
    newSearchParams.set('zoom', zoom.toString())
    setSearchParams(newSearchParams, { replace: true })
    initialUrlUpdateDone.current = true
  }, [center, zoom, setSearchParams, searchParams])

  return (
    <MapView
      center={center}
      zoom={zoom}
      clusters={clusters}
      assets={assets}
      activeFilters={activeFilters}
      selectedAssetTypes={selectedAssetTypes}
      attributeFilters={attributeFilters}
      hasInitialData={true}
      loadMapData={loadMapData}
      onCenterChange={setCenter}
      onZoomChange={setZoom}
      MapEvents={MapEvents}
      flyToLocation={flyToLocation}
    />
  )
}

function MapPage() {
  const { organizationId, workspaceId } = useParams()
  const loaderData = useLoaderData() as {
    initialCenter: [number, number]
    initialZoom: number
    initialAssets: any[]
    initialClusters: any[]
    selectedAsset: any
    selectedAssetAttributes: any[]
  } | null

  const [flyToLocation, setFlyToLocation] = useState<{ coords: [number, number]; zoom: number } | null>(null)
  const [currentBounds, setCurrentBounds] = useState<number[] | null>(null)

  const handleZoomToAsset = useCallback((asset: Asset) => {
    let coords: [number, number] | null = null

    if (asset.geometry?.type === 'Point' && Array.isArray(asset.geometry.coordinates)) {
      coords = [asset.geometry.coordinates[1], asset.geometry.coordinates[0]]
    } else if (asset.geometry?.type === 'Polygon' && Array.isArray(asset.geometry.coordinates) && Array.isArray(asset.geometry.coordinates[0])) {
      const ring = asset.geometry.coordinates[0] as number[][]
      let sumLat = 0, sumLng = 0
      for (const [lng, lat] of ring) {
        sumLat += lat
        sumLng += lng
      }
      coords = [sumLat / ring.length, sumLng / ring.length]
    } else if (asset.geometry?.type === 'LineString' && Array.isArray(asset.geometry.coordinates)) {
      const line = asset.geometry.coordinates as unknown as number[][]
      const midIndex = Math.floor(line.length / 2)
      coords = [line[midIndex][1], line[midIndex][0]]
    } else if (asset.location?.coordinates) {
      coords = [asset.location.coordinates[1], asset.location.coordinates[0]]
    }

    if (coords) {
      setFlyToLocation({ coords, zoom: 18 })
    }
  }, [])

  return (
    <MapProvider
      organizationId={organizationId || ''}
      workspaceId={workspaceId || ''}
      onZoomToAsset={handleZoomToAsset}
      currentBounds={currentBounds}
    >
      <MapPageContent
        workspaceId={workspaceId || ''}
        loaderData={loaderData}
        flyToLocation={flyToLocation}
        onBoundsChange={setCurrentBounds}
      />
    </MapProvider>
  )
}

export default MapPage