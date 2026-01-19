import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams, useNavigation } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import type { Asset } from '@app/types'
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
function MapPageContent({ organizationId, workspaceId, flyToLocation }: {
  organizationId: string
  workspaceId?: string
  flyToLocation: { coords: [number, number]; zoom: number } | null
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigation = useNavigation()
  const {
    assets,
    clusters,
    center,
    zoom,
    setCenter,
    setZoom,
    loadMapData,
    selectedAssetTypes,
    attributeFilters
  } = useMapContext()

  // Check if navigating
  const isNavigating = navigation.state === 'loading'

  // Sync center/zoom to URL and localStorage
  useEffect(() => {
    // Don't update URL while navigating - this can interfere with the pending navigation
    if (isNavigating) {
      return
    }

    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('lat', center[0].toFixed(6))
    newSearchParams.set('lng', center[1].toFixed(6))
    newSearchParams.set('zoom', zoom.toString())
    setSearchParams(newSearchParams, { replace: true })

    // Save position to localStorage for sidebar link
    saveMapPosition(organizationId, workspaceId, { lat: center[0], lng: center[1], zoom })
  }, [center, zoom, setSearchParams, searchParams, organizationId, workspaceId, isNavigating])

  // Key for forcing MapContainer remount on org/workspace change
  const mapKey = `${organizationId}-${workspaceId || 'org'}`

  // Only skip initial data load if we already have data from the loader
  const hasInitialData = assets.length > 0 || clusters.length > 0

  return (
    <MapView
      center={center}
      zoom={zoom}
      clusters={clusters}
      assets={assets}
      activeFilters={null}
      selectedAssetTypes={selectedAssetTypes}
      attributeFilters={attributeFilters}
      hasInitialData={hasInitialData}
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

  const [flyToLocation, setFlyToLocation] = useState<{ coords: [number, number]; zoom: number } | null>(null)

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
    >
      <MapPageContent
        organizationId={organizationId || ''}
        workspaceId={workspaceId}
        flyToLocation={flyToLocation}
      />
    </MapProvider>
  )
}

export default MapPage
