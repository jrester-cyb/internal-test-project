import { useEffect, useRef, useCallback } from 'react'
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

// Debounce delay in ms - balances responsiveness with request reduction
const DEBOUNCE_DELAY = 150

export default function MapEvents({ onLoadData, onCenterChange, onZoomChange, hasInitialData = false }: MapEventsProps) {
  const map = useMap()
  const initialLoadDone = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced data load - prevents flooding server during rapid pan/zoom
  const debouncedLoadData = useCallback((bbox: number[], zoom: number) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      onLoadData(bbox, zoom)
      debounceTimerRef.current = null
    }, DEBOUNCE_DELAY)
  }, [onLoadData])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

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

      // Save position to localStorage (immediate, no debounce needed)
      localStorage.setItem('mapPosition', JSON.stringify({
        lat: center.lat,
        lng: center.lng,
        zoom: currentZoom
      }))

      // Call callbacks to update parent state (immediate)
      if (onCenterChange) {
        onCenterChange([center.lat, center.lng])
      }
      if (onZoomChange) {
        onZoomChange(currentZoom)
      }

      // Trigger debounced data load
      debouncedLoadData(bbox, currentZoom)
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
