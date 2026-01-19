import { useEffect, useRef } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'

interface MapEventsProps {
  onLoadData: (bounds: number[], zoom: number) => void
  filters?: any
  selectedAssetTypes: string[]
  attributeFilters: any[]
  geometryTypeFilter: string[]
  onCenterChange?: (center: [number, number]) => void
  onZoomChange?: (zoom: number) => void
  hasInitialData?: boolean
  organizationId: string
  workspaceId?: string
}

export default function MapEvents({ onLoadData, onCenterChange, onZoomChange, hasInitialData = false }: MapEventsProps) {
  const map = useMap()
  const initialLoadDone = useRef(false)

  useMapEvents({
    moveend: () => {
      const bounds = map.getBounds()
      const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ]
      const currentZoom = map.getZoom()
      const center = map.getCenter()

      // Save position to localStorage
      localStorage.setItem('mapPosition', JSON.stringify({
        lat: center.lat,
        lng: center.lng,
        zoom: currentZoom
      }))

      // Call callbacks to update parent state
      if (onCenterChange) {
        onCenterChange([center.lat, center.lng])
      }
      if (onZoomChange) {
        onZoomChange(currentZoom)
      }

      // Trigger data load via context
      onLoadData(bbox, currentZoom)
    }
  })

  // Load initial data once when map is ready (if not preloaded)
  useEffect(() => {
    if (!initialLoadDone.current && !hasInitialData) {
      const bounds = map.getBounds()
      const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ]
      const currentZoom = map.getZoom()
      onLoadData(bbox, currentZoom)
      initialLoadDone.current = true
    } else if (!initialLoadDone.current && hasInitialData) {
      initialLoadDone.current = true
    }
  }, [map, onLoadData, hasInitialData])

  return null
}
