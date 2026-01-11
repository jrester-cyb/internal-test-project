import { useEffect, useRef } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'

interface MapEventsProps {
  onLoadData: (bounds: number[], zoom: number, filters?: any) => void
  filters?: any
  selectedAssetTypes: string[]
  attributeFilters: any[]
}

export default function MapEvents({ onLoadData, filters, selectedAssetTypes, attributeFilters }: MapEventsProps) {
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

      onLoadData(bbox, currentZoom, filters)
    }
  })

  // Load initial data once when map is ready
  useEffect(() => {
    if (!initialLoadDone.current) {
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
    }
  }, [map, onLoadData, filters])

  // Reload data when selected asset types or attribute filters change
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
  }, [selectedAssetTypes, attributeFilters, map, onLoadData, filters])

  return null
}