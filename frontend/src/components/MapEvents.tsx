import { useEffect, useRef } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'

interface MapEventsProps {
  onLoadData: (bounds: number[], zoom: number, filters?: any) => void
  filters?: any
  selectedAssetTypes: string[]
  attributeFilters: any[]
  geometryTypeFilter: string[]
  onCenterChange?: (center: [number, number]) => void
  onZoomChange?: (zoom: number) => void
  hasInitialData?: boolean
}

export default function MapEvents({ onLoadData, filters, selectedAssetTypes, attributeFilters, geometryTypeFilter, onCenterChange, onZoomChange, hasInitialData = false }: MapEventsProps) {
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

      onLoadData(bbox, currentZoom, filters)
    }
  })

  // Load initial data once when map is ready
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
      onLoadData(bbox, currentZoom, filters)
      initialLoadDone.current = true
    } else if (!initialLoadDone.current && hasInitialData) {
      initialLoadDone.current = true
    }
  }, [map, onLoadData, filters, hasInitialData])

  // Reload data when selected asset types, attribute filters, or geometry type filter change
  useEffect(() => {
    if (initialLoadDone.current) {
      const bounds = map.getBounds()
      const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ]
      const currentZoom = map.getZoom()
      onLoadData(bbox, currentZoom, filters)
    }
  }, [selectedAssetTypes, attributeFilters, geometryTypeFilter, map, onLoadData, filters])

  return null
}