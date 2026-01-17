import { useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMap, Pane } from 'react-leaflet'
import L from 'leaflet'
import { Box, IconButton, Tooltip } from '@mui/material'
import { useTheme as useMuiTheme } from '@mui/material/styles'
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot'
import { useTheme } from '../contexts/ThemeContext'
import { useMapContext } from '../contexts/MapContext'
import ClusterMarkers from './ClusterMarkers'
import AssetClusterLayer from './AssetClusterLayer'
import type { AttributeFilter } from './FilterBuilder'
import type { Asset, Cluster } from '../types'
import './MapView.css'

interface MapViewProps {
  center: [number, number]
  zoom: number
  clusters: Cluster[]
  assets: Asset[]
  activeFilters: any
  selectedAssetTypes: string[]
  attributeFilters: AttributeFilter[]
  hasInitialData?: boolean
  loadMapData: (bounds: number[], zoom: number, filters?: any) => void
  onCenterChange?: (center: [number, number]) => void
  onZoomChange?: (zoom: number) => void
  MapEvents: React.ComponentType<any>
  flyToLocation?: { coords: [number, number]; zoom: number } | null
}

// Component to handle flyTo animation
function FlyToHandler({ flyToLocation }: { flyToLocation: { coords: [number, number]; zoom: number } | null }) {
  const map = useMap()

  useEffect(() => {
    if (flyToLocation) {
      map.flyTo(flyToLocation.coords, flyToLocation.zoom, {
        duration: 1.5
      })
    }
  }, [flyToLocation, map])

  return null
}

export default function MapView({
  center,
  zoom,
  clusters,
  assets,
  activeFilters,
  selectedAssetTypes,
  attributeFilters,
  hasInitialData = false,
  loadMapData,
  onCenterChange,
  onZoomChange,
  MapEvents,
  flyToLocation
}: MapViewProps) {
  const { isDarkMode } = useTheme()
  const theme = useMuiTheme()
  const { openAssetDrawer, openClusterDrawer, selectedAssetId, selectedClusterId, clusteringDisabled, setClusteringDisabled } = useMapContext()

  const fillColor = isDarkMode ? theme.palette.secondary.main : theme.palette.primary.main
  const strokeColor = isDarkMode ? theme.palette.secondary.main : "black"
  const polygonFillColor = isDarkMode ? theme.palette.primary.light : theme.palette.secondary.main
  const polygonStrokeColor = isDarkMode ? theme.palette.primary.light : theme.palette.secondary.main
  const polylineColor = isDarkMode ? "white" : theme.palette.primary.main

  const markerIcon = useMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`
    return L.icon({
      iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
      iconSize: [30, 49],
      iconAnchor: [15, 49],
      popupAnchor: [1, -39],
    })
  }, [fillColor, strokeColor])

  // Glow color for selected markers
  const glowColor = isDarkMode ? theme.palette.primary.light : theme.palette.secondary.main

  // Selected marker with glow using SVG filter for proper blur
  // Original pin: 24x24 viewBox, iconSize [30, 49], iconAnchor [15, 49]
  // The pin tip is at x=12, y=22 in the viewBox (the "s7-7.75 7-13" ends at y=22)
  const selectedMarkerIcon = useMemo(() => {
    // Padding in viewBox units for the glow effect
    const padding = 25
    // Original viewBox is 0,0,24,24. With padding it becomes -padding,-padding,24+2*padding,24+2*padding
    const viewBoxWidth = 24 + padding * 2
    const viewBoxHeight = 24 + padding * 2
    // Keep the same scale as the original (30px wide for 24 viewBox units)
    const scale = 30 / 24
    const width = viewBoxWidth * scale
    const height = viewBoxHeight * scale
    // The pin tip is at viewBox coordinates (12, 22)
    // In the new viewBox, that's at (12 + padding, 22 + padding) from the top-left
    // But we need pixel coordinates: multiply by scale
    // Actually simpler: the anchor should be at the same relative position
    // Original: anchor at (15, 49) for size (30, 49) - that's center-x, bottom
    // The pin in viewBox goes from y=2 to y=22 (height of 20 units = 20 * 1.25 = 25px... but icon is 49px tall?)
    // Let me recalculate: original iconSize is [30, 49] for viewBox [0,0,24,24]
    // So scaleX = 30/24 = 1.25, scaleY = 49/24 ≈ 2.04
    // Pin tip at viewBox y=22 → pixel y = 22 * (49/24) ≈ 44.9 ≈ 45, but anchor is 49...
    // The iconAnchor [15, 49] means: the point on the icon that should be at the marker position
    // 15 = center (30/2), 49 = bottom of the 49px tall icon
    // So the bottom of the icon is placed at the marker position

    // For selected: we add padding, so the icon is bigger, but pin stays same size
    // New size: width = (24 + 50) * 1.25 = 92.5, using same scaleY: height = (24 + 50) * (49/24) = 151
    const scaleY = 49 / 24
    const actualHeight = viewBoxHeight * scaleY
    // Anchor X: center of the new width
    const anchorX = width / 2
    // Anchor Y: the bottom padding in pixels (padding * scaleY) + original anchor (49)
    const anchorY = padding * scaleY + 49

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padding} ${-padding} ${viewBoxWidth} ${viewBoxHeight}" width="${width}" height="${actualHeight}">
      <defs>
        <filter id="glow" x="-300%" y="-300%" width="700%" height="700%">
          <feGaussianBlur stdDeviation="8" result="blur1"/>
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur2"/>
          <feMerge>
            <feMergeNode in="blur1"/>
            <feMergeNode in="blur1"/>
            <feMergeNode in="blur2"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="${glowColor}" filter="url(#glow)"/>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1"/>
    </svg>`
    return L.icon({
      iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
      iconSize: [width, actualHeight],
      iconAnchor: [anchorX, anchorY],
      popupAnchor: [1, -39],
    })
  }, [fillColor, strokeColor, glowColor])

  return (
    <Box
      sx={{
        flexGrow: 1,
        position: 'relative',
        height: '100%',
        width: '100%',
      }}
      className={isDarkMode ? 'dark-mode' : ''}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution={isDarkMode
            ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
          url={isDarkMode
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
        />
        <MapEvents onLoadData={loadMapData} filters={activeFilters} selectedAssetTypes={selectedAssetTypes} attributeFilters={attributeFilters} onCenterChange={onCenterChange} onZoomChange={onZoomChange} hasInitialData={hasInitialData} />
        <FlyToHandler flyToLocation={flyToLocation ?? null} />

        {/* Custom pane for glow effects - z-index 399 is below overlayPane (400) */}
        <Pane name="glowPane" style={{ zIndex: 399 }} />

        {/* Only show cluster markers when clustering is enabled */}
        {!clusteringDisabled && (
          <ClusterMarkers
            clusters={clusters}
            selectedClusterId={selectedClusterId}
            onClusterClick={openClusterDrawer}
          />
        )}

        <ZoomControl position="bottomright" />

        <AssetClusterLayer
          assets={assets}
          selectedAssetId={selectedAssetId}
          markerIcon={markerIcon}
          selectedMarkerIcon={selectedMarkerIcon}
          glowColor={glowColor}
          polygonFillColor={polygonFillColor}
          polygonStrokeColor={polygonStrokeColor}
          polylineColor={polylineColor}
          onAssetClick={openAssetDrawer}
          onClusterClick={openClusterDrawer}
          disableClustering={clusteringDisabled}
        />
      </MapContainer>

      {/* Clustering toggle button */}
      <Tooltip title={clusteringDisabled ? "Enable clustering" : "Disable clustering"} placement="left">
        <IconButton
          onClick={() => setClusteringDisabled(!clusteringDisabled)}
          sx={{
            position: 'absolute',
            bottom: 100,
            right: 10,
            zIndex: 1000,
            bgcolor: 'background.paper',
            boxShadow: 2,
            border: '2px solid',
            borderColor: 'divider',
            '&:hover': {
              bgcolor: 'background.paper',
            },
            color: clusteringDisabled ? 'text.disabled' : 'primary.main',
          }}
          size="small"
        >
          <ScatterPlotIcon />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
