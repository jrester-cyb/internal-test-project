import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useLoaderData } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { fetchClusters, fetchTiles, fetchTilesFromUrl } from '../api/assets'
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
  const { selectedAssetTypes, attributeFilters, nameFilter, geometryTypeFilter, clusteringDisabled } = useMapContext()

  const [center, setCenter] = useState<[number, number]>(loaderData?.initialCenter || [29.9511, -90.0715])
  const [zoom, setZoom] = useState(loaderData?.initialZoom || 10)
  const [assets, setAssets] = useState<any[]>(loaderData?.initialAssets || [])
  const [clusters, setClusters] = useState<any[]>(loaderData?.initialClusters || [])
  const [activeFilters] = useState<any>(null)

  const initialUrlUpdateDone = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Track previous filter state to detect filter changes vs map movements
  const prevFiltersRef = useRef<{
    selectedAssetTypes: string[]
    attributeFilters: any[]
    nameFilter: string
    geometryTypeFilter: string[]
  } | null>(null)

  const loadMapData = useCallback(async (bounds: number[], zoom: number, filters?: any) => {
    if (!workspaceId) return

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    onBoundsChange(bounds)

    // Detect if this is a filter change vs a map movement
    const prevFilters = prevFiltersRef.current
    const isFilterChange = prevFilters !== null && (
      JSON.stringify(prevFilters.selectedAssetTypes) !== JSON.stringify(selectedAssetTypes) ||
      JSON.stringify(prevFilters.attributeFilters) !== JSON.stringify(attributeFilters) ||
      prevFilters.nameFilter !== nameFilter ||
      JSON.stringify(prevFilters.geometryTypeFilter) !== JSON.stringify(geometryTypeFilter)
    )

    // Update the previous filters ref
    prevFiltersRef.current = {
      selectedAssetTypes: [...selectedAssetTypes],
      attributeFilters: [...attributeFilters],
      nameFilter,
      geometryTypeFilter: [...geometryTypeFilter]
    }

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

      // Add geometry type filter if any types are excluded
      if (geometryTypeFilter.length > 0) {
        filterGroups.push({
          field: 'geometry_type',
          value: geometryTypeFilter,
          operator: 'nin'
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
        // When specific asset types are selected, build OR group:
        // (typeA exact AND its filters) OR (typeB exact) OR ...
        const orFilters: any[] = []

        selectedAssetTypes.forEach(typeId => {
          if (attributesByType[typeId]) {
            // Type has attribute filters - AND them together
            const typeFilters: any[] = [
              { field: 'assetTypeId', value: typeId, operator: 'exact' },
              ...attributesByType[typeId]
            ]
            orFilters.push({ logic: 'AND', filters: typeFilters })
          } else {
            // Type has no attribute filters - just match the type
            orFilters.push({ field: 'assetTypeId', value: typeId, operator: 'exact' })
          }
        })

        if (orFilters.length === 1) {
          filterGroups.push(orFilters[0])
        } else {
          filterGroups.push({ logic: 'OR', filters: orFilters })
        }
      } else if (Object.keys(attributesByType).length > 0) {
        // When all asset types are shown but we have attribute filters,
        // build OR group: (type1 exact AND its filters) OR (type2 exact AND its filters) OR (nin filtered types)
        const filteredTypeIds = Object.keys(attributesByType)
        const orFilters: any[] = []

        // Add filter groups for each type with attribute filters
        Object.entries(attributesByType).forEach(([typeId, attrFilters]) => {
          const typeFilters: any[] = [
            { field: 'assetTypeId', value: typeId, operator: 'exact' },
            ...attrFilters
          ]
          orFilters.push({ logic: 'AND', filters: typeFilters })
        })

        // Add a filter for asset types that are NOT being filtered (so they still appear)
        orFilters.push({
          field: 'assetTypeId',
          value: filteredTypeIds,
          operator: 'nin'
        })

        // Wrap in OR logic
        filterGroups.push({ logic: 'OR', filters: orFilters })
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

      // When clustering is disabled, always fetch tiles regardless of zoom level
      if (!clusteringDisabled && zoom < 12) {
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
        // Fetch tiles with pagination - render progressively as each page arrives
        setClusters([])

        // When clustering is disabled, pass zoom level to server for filtering small geometries
        // This reduces data transfer since small polygons/lines won't be visible anyway
        const serverZoom = clusteringDisabled ? zoom : undefined
        let tileData = await fetchTiles(workspaceId, bounds, 1000, mergedFilters, abortController.signal, 0, serverZoom)

        // Check if aborted before processing
        if (abortController.signal.aborted) return

        // Parse first batch of assets
        const firstBatch: Asset[] = []
        for (const f of tileData.features) {
          firstBatch.push({
            id: f.id,
            name: f.properties.name,
            assetType: f.properties.assetTypeId,
            h3Index: f.properties.h3Index,
            geometry: f.geometry
          })
        }

        // Build a set of new asset IDs for deduplication
        const newAssetIds = new Set(firstBatch.map(a => a.id))

        if (clusteringDisabled && !isFilterChange) {
          // Map movement in non-cluster mode: merge with existing assets, never remove
          setAssets(prev => {
            const merged = [...prev.filter(a => !newAssetIds.has(a.id)), ...firstBatch]
            return merged
          })
        } else {
          // Filter change or cluster mode: replace with first batch
          setAssets(firstBatch)
        }

        // Fetch additional pages if available, appending progressively
        let allNewAssets = [...firstBatch]
        while (tileData.next && !abortController.signal.aborted) {
          tileData = await fetchTilesFromUrl(tileData.next, mergedFilters, abortController.signal)

          // Check if aborted before processing
          if (abortController.signal.aborted) return

          const pageAssets: Asset[] = []
          for (const f of tileData.features) {
            pageAssets.push({
              id: f.id,
              name: f.properties.name,
              assetType: f.properties.assetTypeId,
              h3Index: f.properties.h3Index,
              geometry: f.geometry
            })
          }

          allNewAssets = [...allNewAssets, ...pageAssets]
          const allNewIds = new Set(allNewAssets.map(a => a.id))

          if (clusteringDisabled && !isFilterChange) {
            // Map movement in non-cluster mode: merge with existing assets
            setAssets(prev => {
              const merged = [...prev.filter(a => !allNewIds.has(a.id)), ...allNewAssets]
              return merged
            })
          } else {
            // Filter change or cluster mode: just append
            setAssets(allNewAssets)
          }
        }

        // After all pages loaded for a filter change: remove assets not in the new set
        if (isFilterChange && !abortController.signal.aborted) {
          const finalIds = new Set(allNewAssets.map(a => a.id))
          setAssets(prev => prev.filter(a => finalIds.has(a.id)))
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      console.error('Error loading map data:', error)
    }
  }, [workspaceId, selectedAssetTypes, attributeFilters, nameFilter, geometryTypeFilter, clusteringDisabled, onBoundsChange])

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