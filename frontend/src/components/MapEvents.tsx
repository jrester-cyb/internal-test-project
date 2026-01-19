import { useEffect, useRef } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import { useNavigation } from 'react-router-dom'

interface MapEventsProps {
  onLoadData: (bounds: number[], zoom: number, filters?: any) => void
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

export default function MapEvents({ onLoadData, filters, selectedAssetTypes, attributeFilters, geometryTypeFilter, onCenterChange, onZoomChange, hasInitialData = false, organizationId, workspaceId }: MapEventsProps) {
  const map = useMap()
  const navigation = useNavigation()
  const initialLoadDone = useRef(false)

  // Track navigation state in ref for use in event handlers
  const isNavigatingRef = useRef(false)
  isNavigatingRef.current = navigation.state === 'loading'

  // Capture the org/workspace this component was created for
  // If props change to different values, this component is stale
  const initialOrgRef = useRef(organizationId)
  const initialWorkspaceRef = useRef(workspaceId)

  // Check if component is stale (org/workspace changed from initial)
  const isStale = organizationId !== initialOrgRef.current || workspaceId !== initialWorkspaceRef.current

  useMapEvents({
    moveend: () => {
      // Skip if navigating away or component is stale
      if (isNavigatingRef.current) return
      if (isStale) return

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
    // Skip if navigating away or component is stale
    if (isNavigatingRef.current) return
    if (isStale) return

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
    console.log('[MapEvents] filter effect triggered', {
      isNavigating: isNavigatingRef.current,
      isStale,
      propOrgId: organizationId,
      initialOrgId: initialOrgRef.current,
      initialLoadDone: initialLoadDone.current
    })
    // Skip if navigating away or component is stale
    if (isNavigatingRef.current) {
      console.log('[MapEvents] skipping - navigating')
      return
    }
    if (isStale) {
      console.log('[MapEvents] skipping - stale component')
      return
    }

    if (initialLoadDone.current) {
      console.log('[MapEvents] FIRING request')
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
  }, [selectedAssetTypes, attributeFilters, geometryTypeFilter, map, onLoadData, filters, isStale])

  return null
}