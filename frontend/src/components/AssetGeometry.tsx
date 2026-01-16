import { useMemo, useState } from 'react'
import { Marker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet'
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
}

// Calculate the centroid of a polygon
function getPolygonCentroid(coordinates: number[][]): [number, number] {
  let sumLat = 0
  let sumLng = 0
  const n = coordinates.length
  for (const [lng, lat] of coordinates) {
    sumLat += lat
    sumLng += lng
  }
  return [sumLat / n, sumLng / n]
}

// Calculate the midpoint of a polyline
function getPolylineMidpoint(coordinates: number[][]): [number, number] {
  if (coordinates.length === 0) return [0, 0]
  if (coordinates.length === 1) return [coordinates[0][1], coordinates[0][0]]

  // Find the middle segment
  const midIndex = Math.floor(coordinates.length / 2)
  const [lng, lat] = coordinates[midIndex]
  return [lat, lng]
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

export default function AssetGeometry({
  asset,
  isSelected,
  markerIcon,
  selectedMarkerIcon,
  glowColor,
  polygonFillColor,
  polygonStrokeColor,
  polylineColor,
  onAssetClick,
  minPixelSize = 50
}: Readonly<AssetGeometryProps>) {
  const map = useMap()

  // Track zoom to trigger re-renders when zoom changes
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({
    zoomend: () => setZoom(map.getZoom())
  })

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

      if (pixelSize < minPixelSize) {
        // Collapse to pin at centroid
        return {
          type: 'collapsed-polygon' as const,
          position: getPolygonCentroid(coords),
          originalCoords: coords
        }
      }

      return {
        type: 'polygon' as const,
        positions: coords.map(([lng, lat]) => [lat, lng] as [number, number])
      }
    }

    if (type === "LineString" && Array.isArray(coordinates)) {
      const coords = coordinates as unknown as number[][]
      const pixelLength = getPolylinePixelLength(map, coords)

      // Use a smaller threshold for lines since they're 1D
      if (pixelLength < (minPixelSize * 0.6)) {
        // Collapse to pin at midpoint
        return {
          type: 'collapsed-polyline' as const,
          position: getPolylineMidpoint(coords),
          originalCoords: coords
        }
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

  // Collapsed polygon - render as marker at centroid
  if (renderInfo.type === 'collapsed-polygon') {
    return (
      <Marker
        position={renderInfo.position}
        icon={isSelected ? selectedMarkerIcon : markerIcon}
        zIndexOffset={isSelected ? 1000 : 0}
        eventHandlers={{ click: handleClick }}
      />
    )
  }

  // Collapsed polyline - render as marker at midpoint
  if (renderInfo.type === 'collapsed-polyline') {
    return (
      <Marker
        position={renderInfo.position}
        icon={isSelected ? selectedMarkerIcon : markerIcon}
        zIndexOffset={isSelected ? 1000 : 0}
        eventHandlers={{ click: handleClick }}
      />
    )
  }

  // Full polygon
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
              fillOpacity: 0
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
            fillOpacity: 0.2
          }}
        />
      </>
    )
  }

  // Full polyline
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
              lineJoin: 'round'
            }}
          />
        )}
        <Polyline
          positions={renderInfo.positions}
          eventHandlers={{ click: handleClick }}
          pathOptions={{
            color: polylineColor,
            weight: 3
          }}
        />
      </>
    )
  }

  return null
}
