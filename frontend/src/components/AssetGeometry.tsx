import { useMemo, memo } from 'react'
import { Marker, Polygon, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Asset } from '../types'

interface AssetGeometryProps {
  asset: Asset
  isSelected: boolean
  markerIcon: L.Icon
  selectedMarkerIcon: L.Icon
  glowColor: string
  polygonFillColor: string
  polygonStrokeColor: string
  polylineColor: string
  onAssetClick: (asset: Asset) => void
  /** Minimum pixel size before collapsing to pin. Default 50 for area, 30 for length */
  minPixelSize?: number
  /** Current zoom level - passed from parent to avoid individual event listeners */
  currentZoom?: number
  /** Canvas renderer for better performance with many vector elements */
  canvasRenderer?: L.Canvas
}

// Calculate the pixel bounding box diagonal of a polygon
function getPolygonPixelSize(map: L.Map, coordinates: number[][]): number {
  if (coordinates.length < 3) return 0

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const [lng, lat] of coordinates) {
    const point = map.latLngToContainerPoint([lat, lng])
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  // Return the diagonal of the bounding box as a proxy for size
  const width = maxX - minX
  const height = maxY - minY
  return Math.hypot(width, height)
}

// Calculate the total pixel length of a polyline
function getPolylinePixelLength(map: L.Map, coordinates: number[][]): number {
  if (coordinates.length < 2) return 0

  let totalLength = 0
  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1]
    const [lng2, lat2] = coordinates[i]
    const p1 = map.latLngToContainerPoint([lat1, lng1])
    const p2 = map.latLngToContainerPoint([lat2, lng2])
    totalLength += Math.hypot(p2.x - p1.x, p2.y - p1.y)
  }

  return totalLength
}

function AssetGeometryInner({
  asset,
  isSelected,
  markerIcon,
  selectedMarkerIcon,
  glowColor,
  polygonFillColor,
  polygonStrokeColor,
  polylineColor,
  onAssetClick,
  minPixelSize = 50,
  currentZoom,
  canvasRenderer
}: Readonly<AssetGeometryProps>) {
  const map = useMap()

  // Use currentZoom prop if provided (from parent), otherwise fall back to map zoom
  const zoom = currentZoom ?? map.getZoom()

  // Determine what to render based on geometry type and pixel size
  const renderInfo = useMemo(() => {
    if (!asset.geometry) return null

    const { type, coordinates } = asset.geometry

    if (type === "Point" && Array.isArray(coordinates) && coordinates.length === 2) {
      return {
        type: 'point' as const,
        position: [coordinates[1], coordinates[0]] as [number, number]
      }
    }

    if (type === "Polygon" && Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
      const coords = coordinates[0] as unknown as number[][]
      const pixelSize = getPolygonPixelSize(map, coords)

      // Skip rendering if too small
      if (pixelSize < minPixelSize) {
        return null
      }

      return {
        type: 'polygon' as const,
        positions: coords.map(([lng, lat]) => [lat, lng] as [number, number])
      }
    }

    if (type === "LineString" && Array.isArray(coordinates)) {
      const coords = coordinates as unknown as number[][]
      const pixelLength = getPolylinePixelLength(map, coords)

      // Skip rendering if too small (use smaller threshold for lines since they're 1D)
      if (pixelLength < (minPixelSize * 0.6)) {
        return null
      }

      return {
        type: 'polyline' as const,
        positions: coords.map(([lng, lat]) => [lat, lng] as [number, number])
      }
    }

    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.geometry, map, minPixelSize, zoom])

  if (!renderInfo) return null

  const handleClick = () => onAssetClick(asset)

  // Point geometry - always render as marker
  if (renderInfo.type === 'point') {
    return (
      <Marker
        position={renderInfo.position}
        icon={isSelected ? selectedMarkerIcon : markerIcon}
        zIndexOffset={isSelected ? 1000 : 0}
        eventHandlers={{ click: handleClick }}
      />
    )
  }

  // Polygon - use canvas renderer for better performance
  if (renderInfo.type === 'polygon') {
    return (
      <>
        {isSelected && (
          <Polygon
            positions={renderInfo.positions}
            pane="glowPane"
            pathOptions={{
              color: glowColor,
              fillColor: 'transparent',
              weight: 12,
              opacity: 0.4,
              fillOpacity: 0,
              renderer: canvasRenderer
            }}
          />
        )}
        <Polygon
          positions={renderInfo.positions}
          eventHandlers={{ click: handleClick }}
          pathOptions={{
            color: polygonStrokeColor,
            fillColor: polygonFillColor,
            weight: 2,
            fillOpacity: 0.2,
            renderer: canvasRenderer
          }}
        />
      </>
    )
  }

  // Full polyline - use canvas renderer for better performance
  if (renderInfo.type === 'polyline') {
    return (
      <>
        {isSelected && (
          <Polyline
            positions={renderInfo.positions}
            pane="glowPane"
            pathOptions={{
              color: glowColor,
              weight: 11,
              opacity: 0.5,
              lineCap: 'round',
              lineJoin: 'round',
              renderer: canvasRenderer
            }}
          />
        )}
        <Polyline
          positions={renderInfo.positions}
          eventHandlers={{ click: handleClick }}
          pathOptions={{
            color: polylineColor,
            weight: 3,
            renderer: canvasRenderer
          }}
        />
      </>
    )
  }

  return null
}

// Memoize to prevent re-renders when parent updates but props haven't changed
const AssetGeometry = memo(AssetGeometryInner, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  return (
    prevProps.asset.id === nextProps.asset.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.currentZoom === nextProps.currentZoom &&
    prevProps.markerIcon === nextProps.markerIcon &&
    prevProps.selectedMarkerIcon === nextProps.selectedMarkerIcon &&
    prevProps.glowColor === nextProps.glowColor &&
    prevProps.polygonFillColor === nextProps.polygonFillColor &&
    prevProps.polygonStrokeColor === nextProps.polygonStrokeColor &&
    prevProps.polylineColor === nextProps.polylineColor &&
    prevProps.canvasRenderer === nextProps.canvasRenderer
  )
})

export default AssetGeometry
