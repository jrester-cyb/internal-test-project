import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Polygon, Polyline, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import { Box, CircularProgress, Typography, IconButton } from '@mui/material'
import { Clear as ClearIcon } from '@mui/icons-material'
import { useTheme as useMuiTheme } from '@mui/material/styles'
import { useTheme } from '../contexts/ThemeContext'
import AssetDetailsDrawer from './AssetDetailsDrawer'
import ClusterDetailsDrawer from './ClusterDetailsDrawer'
import ClusterMarkers from './ClusterMarkers'
import AssetList from './AssetList'
import FilterBuilder from './FilterBuilder'
import type { AttributeFilter } from './FilterBuilder'
import type { Asset, Cluster } from '../types'
import './MapView.css'

interface MapViewProps {
  organizationId: string
  workspaceId: string
  center: [number, number]
  zoom: number
  clusters: Cluster[]
  assets: Asset[]
  selectedAsset: Asset | null
  loadingAsset: boolean
  selectedCluster: Cluster | null
  loading: boolean
  clusterAssets: Asset[]
  activeFilters: any
  selectedAssetTypes: string[]
  attributeFilters: AttributeFilter[]
  nameFilter: string
  selectedAssetAttributes: any[]
  hasInitialData?: boolean
  setSelectedAssetTypes: (types: string[]) => void
  setAttributeFilters: (filters: AttributeFilter[]) => void
  setNameFilter: (name: string) => void
  loadMapData: (bounds: number[], zoom: number, filters?: any) => void
  handleClusterClick: (cluster: Cluster) => void
  handleAssetClick: (asset: Asset) => void
  setSelectedAsset: (asset: Asset | null) => void
  setSelectedCluster: (cluster: Cluster | null) => void
  setClusterAssets: (assets: Asset[]) => void
  onCenterChange?: (center: [number, number]) => void
  onZoomChange?: (zoom: number) => void
  MapEvents: React.ComponentType<any>
}

export default function MapView({
  organizationId,
  workspaceId,
  center,
  zoom,
  clusters,
  assets,
  selectedAsset,
  loadingAsset,
  selectedCluster,
  loading,
  clusterAssets,
  activeFilters,
  selectedAssetTypes,
  attributeFilters,
  nameFilter,
  selectedAssetAttributes,
  hasInitialData = false,
  setSelectedAssetTypes,
  setAttributeFilters,
  setNameFilter,
  loadMapData,
  handleClusterClick,
  handleAssetClick,
  setSelectedAsset,
  setSelectedCluster,
  setClusterAssets,
  onCenterChange,
  onZoomChange,
  MapEvents
}: MapViewProps) {
  const { isDarkMode } = useTheme()
  const theme = useMuiTheme()
  const [filterOpen, setFilterOpen] = useState(false)

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

  return (
    <>
      <Box
        sx={{ flexGrow: 1, position: 'relative', height: '100%', width: '100%' }}
        className={isDarkMode ? 'dark-mode' : ''}
      >
        <FilterBuilder
          workspaceId={workspaceId}
          selectedAssetTypes={selectedAssetTypes}
          onAssetTypesChange={setSelectedAssetTypes}
          attributeFilters={attributeFilters}
          onAttributeFiltersChange={setAttributeFilters}
          nameFilter={nameFilter}
          onNameFilterChange={setNameFilter}
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          onToggle={() => setFilterOpen(!filterOpen)}
        />

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

          <ClusterMarkers
            clusters={clusters}
            onClusterClick={handleClusterClick}
          />

          <ZoomControl position="bottomright" />

          {assets.map(asset => (
            asset.geometry && asset.geometry.type === "Point" && Array.isArray(asset.geometry.coordinates) && asset.geometry.coordinates.length === 2 ? (
              <Marker
                key={asset.id}
                position={[asset.geometry.coordinates[1], asset.geometry.coordinates[0]]}
                icon={markerIcon}
                eventHandlers={{
                  click: () => handleAssetClick(asset)
                }}
              />
            ) : asset.geometry && asset.geometry.type === "Polygon" && Array.isArray(asset.geometry.coordinates) && Array.isArray(asset.geometry.coordinates[0]) ? (
              <Polygon
                key={asset.id}
                positions={asset.geometry.coordinates[0].map(([lng, lat]: [number, number]) => [lat, lng])}
                eventHandlers={{
                  click: () => handleAssetClick(asset)
                }}
                pathOptions={{ color: polygonStrokeColor, fillColor: polygonFillColor, weight: 2, fillOpacity: 0.2 }}
              />
            ) : asset.geometry && asset.geometry.type === "LineString" && Array.isArray(asset.geometry.coordinates) ? (
              <Polyline
                key={asset.id}
                positions={asset.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng])}
                eventHandlers={{
                  click: () => handleAssetClick(asset)
                }}
                pathOptions={{ color: polylineColor, weight: 3 }}
              />
            ) : null
          ))}
        </MapContainer>
      </Box>
      <AssetDetailsDrawer
        asset={selectedAsset}
        organizationId={organizationId}
        workspaceId={workspaceId}
        isOpen={!!selectedAsset}
        onClose={() => setSelectedAsset(null)}
        attributes={selectedAssetAttributes}
      />
      <ClusterDetailsDrawer
        isOpen={!!selectedCluster}
        onClose={() => setSelectedCluster(null)}
        cluster={selectedCluster}
        assets={clusterAssets}
        loading={loading}
        organizationId={organizationId}
      />
    </>
  )
}
