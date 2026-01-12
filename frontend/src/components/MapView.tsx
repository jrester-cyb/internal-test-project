import { useState } from 'react'
import { MapContainer, TileLayer, Marker, Polygon, Polyline, ZoomControl } from 'react-leaflet'
import { Box, CircularProgress, Typography, IconButton, Button } from '@mui/material'
import { Clear as ClearIcon, FilterList as FilterListIcon } from '@mui/icons-material'
import AssetDetails from './AssetDetails'
import ClusterMarkers from './ClusterMarkers'
import AssetList from './AssetList'
import FilterBuilder from './FilterBuilder'
import type { AttributeFilter } from './FilterBuilder'
import type { Asset, Cluster } from '../types'

interface MapViewProps {
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
  setSelectedAssetTypes: (types: string[]) => void
  setAttributeFilters: (filters: AttributeFilter[]) => void
  setNameFilter: (name: string) => void
  loadMapData: (bounds: number[], zoom: number, filters?: any) => void
  handleClusterClick: (cluster: Cluster) => void
  handleAssetClick: (asset: Asset) => void
  setSelectedAsset: (asset: Asset | null) => void
  setSelectedCluster: (cluster: Cluster | null) => void
  setClusterAssets: (assets: Asset[]) => void
  MapEvents: React.ComponentType<any>
}

export default function MapView({
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
  setSelectedAssetTypes,
  setAttributeFilters,
  setNameFilter,
  loadMapData,
  handleClusterClick,
  handleAssetClick,
  setSelectedAsset,
  setSelectedCluster,
  setClusterAssets,
  MapEvents
}: MapViewProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const totalFilters = selectedAssetTypes.length + attributeFilters.length + (nameFilter ? 1 : 0)

  return (
    <>
      <Box sx={{ flexGrow: 1, position: 'relative', height: '100%', width: '100%' }}>
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
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents onLoadData={loadMapData} filters={activeFilters} selectedAssetTypes={selectedAssetTypes} attributeFilters={attributeFilters} />

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
                pathOptions={{ color: 'blue', weight: 2, fillOpacity: 0.2 }}
              />
            ) : asset.geometry && asset.geometry.type === "LineString" && Array.isArray(asset.geometry.coordinates) ? (
              <Polyline
                key={asset.id}
                positions={asset.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng])}
                eventHandlers={{
                  click: () => handleAssetClick(asset)
                }}
                pathOptions={{ color: 'red', weight: 3 }}
              />
            ) : null
          ))}
        </MapContainer>
      </Box>

      {selectedAsset && (
        <AssetDetails
          asset={selectedAsset}
          workspaceId={workspaceId}
          onClose={() => setSelectedAsset(null)}
        />
      )}
      {loadingAsset && (
        <Box sx={{ position: 'absolute', top: 80, right: 16, bgcolor: 'white', p: 2, borderRadius: 1, boxShadow: 2, zIndex: 2000, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={20} />
          <Typography>Loading asset details...</Typography>
        </Box>
      )}

      {selectedCluster && (
        <Box sx={{ position: 'fixed', top: 64, bottom: 0, right: 0, width: '66%', bgcolor: 'background.paper', boxShadow: 24, zIndex: 1301, overflowY: 'auto' }}>
          <Box sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h5" component="h2">
                Cluster Assets ({clusterAssets?.length ?? 0})
              </Typography>
              <IconButton
                onClick={() => {
                  setSelectedCluster(null)
                  setClusterAssets([])
                }}
              >
                <ClearIcon />
              </IconButton>
            </Box>

            <AssetList
              assets={clusterAssets}
              onAssetClick={(asset) => {
                setSelectedAsset(asset);
                setSelectedCluster(null);
              }}
              loading={loading}
              currentPage={1}
              totalPages={1}
              totalCount={clusterAssets?.length ?? 0}
            />
          </Box>
        </Box>
      )}
    </>
  )
}
