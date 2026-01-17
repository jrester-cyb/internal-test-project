import { useMemo, useState, useCallback } from 'react'
import { useMap, useMapEvents, Marker } from 'react-leaflet'
import L from 'leaflet'
import Supercluster from 'supercluster'
import type { Asset, Cluster } from '../types'
import AssetGeometry from './AssetGeometry'
import { useTheme } from '../contexts/ThemeContext'
import { lightTheme, darkTheme } from '../theme'

interface AssetClusterLayerProps {
  assets: Asset[]
  selectedAssetId: string | null
  markerIcon: L.Icon
  selectedMarkerIcon: L.Icon
  glowColor: string
  polygonFillColor: string
  polygonStrokeColor: string
  polylineColor: string
  onAssetClick: (asset: Asset) => void
  onClusterClick?: (cluster: Cluster) => void
  /** Cluster radius in pixels */
  clusterRadius?: number
  /** Maximum zoom at which clustering occurs */
  maxClusterZoom?: number
  /** When true, disables client-side clustering and shows all assets individually */
  disableClustering?: boolean
}

type PointFeature = {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    assetId: string
    asset: Asset
  }
}

type ClusterFeature = {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    cluster: true
    cluster_id: number
    point_count: number
    point_count_abbreviated: string | number
  }
}

type Feature = PointFeature | ClusterFeature

function isCluster(feature: Feature): feature is ClusterFeature {
  return 'cluster' in feature.properties && feature.properties.cluster === true
}

// Get the centroid of a geometry for clustering
function getGeometryCentroid(asset: Asset): [number, number] | null {
  if (!asset.geometry) return null

  const { type, coordinates } = asset.geometry

  if (type === 'Point' && Array.isArray(coordinates) && coordinates.length === 2) {
    return [coordinates[0], coordinates[1]]
  }

  if (type === 'Polygon' && Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
    const ring = coordinates[0] as number[][]
    let sumLng = 0, sumLat = 0
    for (const [lng, lat] of ring) {
      sumLng += lng
      sumLat += lat
    }
    return [sumLng / ring.length, sumLat / ring.length]
  }

  if (type === 'LineString' && Array.isArray(coordinates)) {
    const line = coordinates as number[][]
    const midIndex = Math.floor(line.length / 2)
    return [line[midIndex][0], line[midIndex][1]]
  }

  return null
}

// Find the most common H3 index among a set of assets, or the longest common prefix
function getMostCommonH3Index(assets: Asset[]): string | null {
  const h3Counts = new Map<string, number>()

  for (const asset of assets) {
    const h3Index = asset.h3Index
    if (h3Index) {
      h3Counts.set(h3Index, (h3Counts.get(h3Index) || 0) + 1)
    }
  }

  if (h3Counts.size === 0) return null

  // Find most common
  let mostCommon: string | null = null
  let maxCount = 0

  for (const [h3Index, count] of h3Counts) {
    if (count > maxCount) {
      maxCount = count
      mostCommon = h3Index
    }
  }

  // If no single H3 index covers most assets, try finding common prefix
  if (mostCommon && maxCount < assets.length / 2 && h3Counts.size > 1) {
    // Get all H3 indices
    const indices = Array.from(h3Counts.keys())
    // Find common prefix - start from full length and reduce
    let prefix = indices[0]
    while (prefix.length > 1) {
      const allMatch = indices.every(idx => idx.startsWith(prefix))
      if (allMatch) {
        return prefix
      }
      prefix = prefix.slice(0, -1)
    }
  }

  return mostCommon
}

export default function AssetClusterLayer({
  assets,
  selectedAssetId,
  markerIcon,
  selectedMarkerIcon,
  glowColor,
  polygonFillColor,
  polygonStrokeColor,
  polylineColor,
  onAssetClick,
  onClusterClick,
  clusterRadius = 60,
  maxClusterZoom = 18,
  disableClustering = false
}: Readonly<AssetClusterLayerProps>) {
  const map = useMap()
  const { isDarkMode } = useTheme()

  // Track map state to trigger re-renders
  const [mapState, setMapState] = useState({
    zoom: map.getZoom(),
    bounds: map.getBounds()
  })

  useMapEvents({
    zoomend: () => setMapState({ zoom: map.getZoom(), bounds: map.getBounds() }),
    moveend: () => setMapState({ zoom: map.getZoom(), bounds: map.getBounds() })
  })

  // Create supercluster index with asset data
  const supercluster = useMemo(() => {
    const index = new Supercluster<PointFeature['properties']>({
      radius: clusterRadius,
      maxZoom: maxClusterZoom,
      minZoom: 0
    })

    // Convert assets to GeoJSON points for clustering
    const points: PointFeature[] = []
    for (const asset of assets) {
      const centroid = getGeometryCentroid(asset)
      if (centroid) {
        points.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: centroid
          },
          properties: {
            assetId: asset.id,
            asset
          }
        })
      }
    }

    index.load(points)
    return index
  }, [assets, clusterRadius, maxClusterZoom])

  // Get clusters for current viewport
  const clusters = useMemo(() => {
    const bounds = mapState.bounds
    const zoom = mapState.zoom

    // Get bbox in [west, south, east, north] format
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth()
    ]

    return supercluster.getClusters(bbox, Math.floor(zoom)) as Feature[]
  }, [supercluster, mapState])

  // Handle cluster click - get assets in cluster and open drawer
  const handleClusterClick = useCallback((clusterId: number, coordinates: [number, number]) => {
    // Get all assets (leaves) in this cluster
    const leaves = supercluster.getLeaves(clusterId, Infinity) as PointFeature[]
    const clusterAssets = leaves.map(leaf => leaf.properties.asset)

    // Find the most common H3 index (for display purposes)
    const h3Index = getMostCommonH3Index(clusterAssets)

    // Compute bounding box of all assets in the cluster
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
    for (const leaf of leaves) {
      const [lng, lat] = leaf.geometry.coordinates
      minLon = Math.min(minLon, lng)
      minLat = Math.min(minLat, lat)
      maxLon = Math.max(maxLon, lng)
      maxLat = Math.max(maxLat, lat)
    }

    // Add a tiny buffer to the bbox (approximately 1 meter) to handle floating point precision
    const buffer = 0.00001 // ~1 meter in degrees
    minLon -= buffer
    minLat -= buffer
    maxLon += buffer
    maxLat += buffer

    if (onClusterClick) {
      // Create a Cluster object with bbox for accurate search
      const cluster: Cluster = {
        h3Index: h3Index || `client-cluster-${clusterId}`,
        count: clusterAssets.length,
        center: {
          lat: coordinates[1],
          lon: coordinates[0]
        },
        bbox: [minLon, minLat, maxLon, maxLat]
      }

      onClusterClick(cluster)
    } else {
      // Fallback: just zoom in to expand the cluster
      const expansionZoom = Math.min(
        supercluster.getClusterExpansionZoom(clusterId),
        maxClusterZoom
      )
      map.flyTo([coordinates[1], coordinates[0]], expansionZoom, { duration: 0.5 })
    }
  }, [supercluster, map, maxClusterZoom, onClusterClick])

  // Theme colors for cluster markers
  const bgColor = lightTheme.palette.primary.main
  const textColor = isDarkMode ? darkTheme.palette.secondary.dark : lightTheme.palette.secondary.light
  const outlineColor = textColor

  // Create cluster icon
  const createClusterIcon = useCallback((count: number) => {
    const size = Math.max(30, Math.min(60, 30 + Math.log10(count) * 10))
    const padding = 15
    const svgSize = size + padding * 2
    const centerOffset = svgSize / 2

    const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" style="margin-left: -${centerOffset}px; margin-top: -${centerOffset}px;">
      <circle cx="${centerOffset}" cy="${centerOffset}" r="${size / 2 - 1}" fill="${bgColor}" stroke="${outlineColor}" stroke-width="2"/>
      <text x="${centerOffset}" y="${centerOffset}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" font-weight="bold" font-size="12" font-family="system-ui, -apple-system, sans-serif">${count}</text>
    </svg>`

    return L.divIcon({
      html: svgHtml,
      className: '',
      iconSize: [svgSize, svgSize]
    })
  }, [bgColor, textColor, outlineColor])

  // When clustering is disabled, render all assets directly without going through Supercluster
  if (disableClustering) {
    return (
      <>
        {assets.map((asset) => (
          <AssetGeometry
            key={asset.id}
            asset={asset}
            isSelected={selectedAssetId === asset.id}
            markerIcon={markerIcon}
            selectedMarkerIcon={selectedMarkerIcon}
            glowColor={glowColor}
            polygonFillColor={polygonFillColor}
            polygonStrokeColor={polygonStrokeColor}
            polylineColor={polylineColor}
            onAssetClick={onAssetClick}
          />
        ))}
      </>
    )
  }

  return (
    <>
      {clusters.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates

        if (isCluster(feature)) {
          // Render cluster marker
          const { cluster_id, point_count } = feature.properties

          return (
            <Marker
              key={`cluster-${cluster_id}`}
              position={[lat, lng]}
              icon={createClusterIcon(point_count)}
              eventHandlers={{
                click: () => handleClusterClick(cluster_id, [lng, lat])
              }}
            />
          )
        } else {
          // Render individual asset using AssetGeometry
          const { asset } = feature.properties

          return (
            <AssetGeometry
              key={asset.id}
              asset={asset}
              isSelected={selectedAssetId === asset.id}
              markerIcon={markerIcon}
              selectedMarkerIcon={selectedMarkerIcon}
              glowColor={glowColor}
              polygonFillColor={polygonFillColor}
              polygonStrokeColor={polygonStrokeColor}
              polylineColor={polylineColor}
              onAssetClick={onAssetClick}
            />
          )
        }
      })}
    </>
  )
}
