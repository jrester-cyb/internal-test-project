import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useLoaderData, useNavigation, useLocation } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { fetchClusters, fetchTiles } from '@app/api/assets'
import type { Asset, Cluster } from '@app/types'
import type { AttributeFilter } from '@app/components/FilterBuilder'
import { MapProvider, useMapContext } from '@app/contexts/MapContext'
import MapView from '@app/components/MapView'
import MapEvents from '@app/components/MapEvents'
import { saveMapPosition } from '@app/utils/mapPosition'

// Fix for default marker icon in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Inner component that can access MapContext
function MapPageContent({ organizationId, workspaceId, loaderData, flyToLocation, onBoundsChange }: {
  organizationId: string
  workspaceId?: string
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
  const navigation = useNavigation()
  const location = useLocation()
  const { selectedAssetTypes, attributeFilters, geometryTypeFilter, clusteringDisabled, buildFilters } = useMapContext()

  // Track current location path in a ref to verify requests match current route
  const locationPathRef = useRef(location.pathname)
  locationPathRef.current = location.pathname

  // Track if we're navigating away to prevent stale requests - use ref for stable access in callbacks
  const isNavigatingAway = navigation.state === 'loading' && navigation.location?.pathname !== undefined
  const isNavigatingAwayRef = useRef(isNavigatingAway)
  isNavigatingAwayRef.current = isNavigatingAway

  // Track if component is still active (not unmounted or navigating away)
  const isActiveRef = useRef(true)

  const [center, setCenter] = useState<[number, number]>(loaderData?.initialCenter || [39.0, -98.0])
  const [zoom, setZoom] = useState(loaderData?.initialZoom || 5)
  const [assets, setAssets] = useState<any[]>(loaderData?.initialAssets || [])
  const [clusters, setClusters] = useState<any[]>(loaderData?.initialClusters || [])
  const [activeFilters] = useState<any>(null)

  const initialUrlUpdateDone = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadMapData = useCallback(async (bounds: number[], zoom: number, filters?: any) => {
    // Skip fetching if we're navigating away or component is deactivated
    if (!organizationId || isNavigatingAwayRef.current || !isActiveRef.current) return

    // Verify current URL still matches this component's org/workspace to prevent stale requests
    const currentPath = locationPathRef.current
    const expectedPathPrefix = workspaceId
      ? `/organizations/${organizationId}/workspaces/${workspaceId}`
      : `/organizations/${organizationId}`
    if (!currentPath.startsWith(expectedPathPrefix)) {
      return
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    onBoundsChange(bounds)


    try {
      let mergedFilters = filters ? { ...filters } : null
      const filterGroups = buildFilters()

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
            logic: 'AND'
          }
        }
      }

      // When clustering is disabled, always fetch tiles regardless of zoom level
      if (!clusteringDisabled && zoom < 12) {
        const clusterData = await fetchClusters(organizationId, workspaceId, zoom, bounds, mergedFilters, abortController.signal)
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
        // Fetch tiles with pagination - render progressively as pages arrive
        // Use parallel fetching for better performance (3 concurrent requests)
        setClusters([])

        // When clustering is disabled, pass zoom level to server for filtering small geometries
        // This reduces data transfer since small polygons/lines won't be visible anyway
        const serverZoom = clusteringDisabled ? zoom : undefined
        const pageSize = 250
        const parallelRequests = 3

        // Fetch first page to get total count
        const firstPageData = await fetchTiles(organizationId, workspaceId, bounds, pageSize, mergedFilters, abortController.signal, 0, serverZoom)

        // Check if aborted before processing
        if (abortController.signal.aborted) return

        // Parse first batch of assets
        const parseFeatures = (features: any[]): Asset[] => {
          return features.map(f => ({
            id: f.id,
            name: f.properties.name,
            assetType: f.properties.assetTypeId,
            h3Index: f.properties.h3Index,
            geometry: f.geometry
          }))
        }

        const firstBatch = parseFeatures(firstPageData.features)
        let allNewAssets = [...firstBatch]

        // Update UI with first batch immediately
        const newAssetIds = new Set(firstBatch.map(a => a.id))
        setAssets(prev => {
          const merged = [...prev.filter(a => !newAssetIds.has(a.id)), ...firstBatch]
          return merged
        })

        // Calculate remaining pages needed
        const total = firstPageData.total
        const remainingCount = total - firstPageData.features.length

        if (remainingCount > 0 && !abortController.signal.aborted) {
          // Calculate all remaining offsets
          const offsets: number[] = []
          for (let offset = pageSize; offset < total; offset += pageSize) {
            offsets.push(offset)
          }

          // Fetch remaining pages in parallel batches
          for (let i = 0; i < offsets.length && !abortController.signal.aborted; i += parallelRequests) {
            const batchOffsets = offsets.slice(i, i + parallelRequests)

            // Fetch batch in parallel
            const batchPromises = batchOffsets.map(offset =>
              fetchTiles(organizationId, workspaceId, bounds, pageSize, mergedFilters, abortController.signal, offset, serverZoom)
            )

            try {
              const batchResults = await Promise.all(batchPromises)

              // Check if aborted after batch completes
              if (abortController.signal.aborted) return

              // Parse and collect all assets from this batch
              const batchAssets: Asset[] = []
              for (const pageData of batchResults) {
                batchAssets.push(...parseFeatures(pageData.features))
              }

              allNewAssets = [...allNewAssets, ...batchAssets]
              const allNewIds = new Set(allNewAssets.map(a => a.id))

              // Merge new assets with existing - don't remove anything yet
              setAssets(prev => {
                const merged = [...prev.filter(a => !allNewIds.has(a.id)), ...allNewAssets]
                return merged
              })
            } catch (error) {
              // If any request in the batch was aborted, stop processing
              if (error instanceof Error && error.name === 'AbortError') {
                return
              }
              throw error
            }
          }
        }

        // After all pages loaded: remove assets not in the new set
        // This is when we finally clean up stale assets
        // (geometry type filtering happens immediately on the UI via AssetClusterLayer)
        if (!abortController.signal.aborted) {
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
  }, [organizationId, workspaceId, selectedAssetTypes, attributeFilters, geometryTypeFilter, clusteringDisabled, buildFilters, onBoundsChange])

  // Cleanup pending requests when org/workspace changes or component unmounts
  useEffect(() => {
    isActiveRef.current = true
    return () => {
      isActiveRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [organizationId, workspaceId])

  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('lat', center[0].toFixed(6))
    newSearchParams.set('lng', center[1].toFixed(6))
    newSearchParams.set('zoom', zoom.toString())
    setSearchParams(newSearchParams, { replace: true })
    initialUrlUpdateDone.current = true

    // Save position to localStorage for sidebar link
    saveMapPosition(organizationId, workspaceId, { lat: center[0], lng: center[1], zoom })
  }, [center, zoom, setSearchParams, searchParams, organizationId, workspaceId])

  // Key for forcing MapContainer remount on org/workspace change
  const mapKey = `${organizationId}-${workspaceId || 'org'}`

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
      mapKey={mapKey}
      organizationId={organizationId}
      workspaceId={workspaceId}
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

  // Key forces complete remount when org/workspace changes, ensuring clean state
  const mapKey = `${organizationId}-${workspaceId || 'org'}`

  return (
    <MapProvider
      key={mapKey}
      onZoomToAsset={handleZoomToAsset}
      currentBounds={currentBounds}
    >
      <MapPageContent
        organizationId={organizationId || ''}
        workspaceId={workspaceId}
        loaderData={loaderData}
        flyToLocation={flyToLocation}
        onBoundsChange={setCurrentBounds}
      />
    </MapProvider>
  )
}

export default MapPage