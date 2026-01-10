import { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { AppBar, Toolbar, Box, Typography, IconButton } from '@mui/material'
import { Brightness4 as DarkModeIcon, Brightness7 as LightModeIcon } from '@mui/icons-material'
import { useTheme } from './contexts/ThemeContext'
import { getAsset } from './api/assets'
import { fetchClusters, fetchTiles, searchAssets, interpretSearch } from './api/assets'
import type { Asset, Cluster } from './types'
import AssetList from './components/AssetList'
import type { AttributeFilter } from './components/FilterBuilder'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'

// Fix for default marker icon in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Theme toggle component
function ThemeToggle() {
  const { isDarkMode, toggleTheme } = useTheme()

  return (
    <IconButton onClick={toggleTheme} color="inherit">
      {isDarkMode ? <LightModeIcon /> : <DarkModeIcon />}
    </IconButton>
  )
}

// Component to handle map events - outside App to prevent recreation
function MapEvents({ onLoadData, filters, selectedAssetTypes, attributeFilters }: {
  onLoadData: (bounds: number[], zoom: number, filters?: any) => void,
  filters?: any,
  selectedAssetTypes: string[],
  attributeFilters: any[]
}) {
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

function App() {
  // Load saved position from localStorage or use default
  const getSavedPosition = () => {
    try {
      const saved = localStorage.getItem('mapPosition')
      if (saved) {
        const { lat, lng, zoom } = JSON.parse(saved)
        return { center: [lat, lng] as [number, number], zoom }
      }
    } catch (e) {
      console.error('Error loading saved position:', e)
    }
    return { center: [29.9511, -90.0715] as [number, number], zoom: 10 }
  }

  const { center: initialCenter, zoom: initialZoom } = getSavedPosition()
  const [center, setCenter] = useState<[number, number]>(initialCenter)
  const [zoom, setZoom] = useState(initialZoom)

  const [clusters, setClusters] = useState<Cluster[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [loadingAsset, setLoadingAsset] = useState(false)
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [clusterAssets, setClusterAssets] = useState<Asset[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [activeFilters, setActiveFilters] = useState<any>(null)
  const [interpretation, setInterpretation] = useState<string>('')
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([])
  const [attributeFilters, setAttributeFilters] = useState<AttributeFilter[]>([])

  const loadMapData = useCallback(async (bounds: number[], zoom: number, filters?: any) => {
    setLoading(true)
    try {
      // Merge asset type and attribute filters with other filters
      let mergedFilters = filters ? { ...filters } : null
      const filterGroups: any[] = []

      // Group attribute filters by asset type
      const attributesByType: Record<string, any[]> = {}
      attributeFilters.forEach(af => {
        if (!attributesByType[af.assetTypeId]) {
          attributesByType[af.assetTypeId] = []
        }
        attributesByType[af.assetTypeId].push({
          field: `attributes.${af.attributeKey}`,
          value: af.value,
          operator: af.operator
        })
      })

      // Create filter groups: each asset type with its attribute filters in an AND clause
      if (selectedAssetTypes.length > 0) {
        selectedAssetTypes.forEach(typeId => {
          const typeFilters: any[] = [
            {
              field: 'assetTypeId',
              value: typeId,
              operator: 'exact'
            }
          ]

          // Add attribute filters for this asset type
          if (attributesByType[typeId]) {
            typeFilters.push(...attributesByType[typeId])
          }

          // If only one filter (just the asset type), add it directly
          // Otherwise, wrap in an AND clause
          if (typeFilters.length === 1) {
            filterGroups.push(typeFilters[0])
          } else {
            filterGroups.push({
              logic: 'AND',
              filters: typeFilters
            })
          }
        })
      }

      if (filterGroups.length > 0) {
        if (mergedFilters && mergedFilters.filters) {
          mergedFilters = {
            ...mergedFilters,
            filters: [...mergedFilters.filters, ...filterGroups],
            logic: 'AND'
          }
        } else {
          mergedFilters = {
            filters: filterGroups,
            logic: selectedAssetTypes.length > 1 ? 'OR' : 'AND'
          }
        }
      }

      if (zoom < 12) {
        // Show clusters at high zoom out
        const clusterData = await fetchClusters(zoom, bounds, mergedFilters)
        // Separate GeoJSON features (single-asset clusters) from true clusters
        const geojsonAssets: Asset[] = []
        const realClusters: Cluster[] = []
        for (const c of clusterData.clusters) {
          if (c.type === 'Feature' && c.geometry && c.properties) {
            geojsonAssets.push({
              id: c.id,
              name: c.properties.name,
              assetTypeId: c.properties.assetTypeId,
              h3Index: c.properties.h3Index,
              geometry: c.geometry
            })
          } else {
            realClusters.push(c)
          }
        }
        setClusters(realClusters)
        setAssets(geojsonAssets)
      } else {
        // Show individual assets when zoomed in
        const tileData = await fetchTiles(bounds, 5000, mergedFilters)
        setAssets(tileData.features.map((f: any) => ({
          id: f.id,
          name: f.properties.name,
          assetTypeId: f.properties.assetTypeId,
          h3Index: f.properties.h3Index,
          geometry: f.geometry
        })))
        setClusters([])
      }
    } catch (error) {
      console.error('Error loading map data:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedAssetTypes, attributeFilters])

  const handleClusterClick = async (cluster: Cluster) => {
    setSelectedCluster(cluster)
    setLoading(true)
    try {
      const results = await searchAssets({
        filters: [{
          field: 'h3_index',
          value: cluster.h3Index,
          operator: 'startswith'
        }]
      })
      setClusterAssets(results.results)
    } catch (error) {
      console.error('Error loading cluster assets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAssetClick = async (asset: Asset) => {
    setLoadingAsset(true)
    try {
      const fullAsset = await getAsset(asset.id)
      setSelectedAsset(fullAsset)
    } catch (error) {
      setSelectedAsset(asset)
      console.error('Error fetching asset details:', error)
    } finally {
      setLoadingAsset(false)
    }
  }
  const handleSearch = async (page: number = 1) => {
    if (!query.trim()) {
      // Clear filters
      setActiveFilters(null)
      setInterpretation('')
      return
    }

    setLoading(true)
    try {
      // First, interpret the natural language query
      const interpreted = await interpretSearch(query)
      setInterpretation(interpreted.interpretation || '')

      const filters = {
        filters: interpreted.filters,
        logic: interpreted.logic || 'AND'
      }

      const results = await searchAssets({
        ...filters,
        page,
        limit: 50
      })
      setAssets(results.results || [])
      setCurrentPage(results.page || 1)
      setTotalPages(results.total_pages || 1)
      setTotalCount(results.count || 0)

      // Set active filters to update map
      setActiveFilters(filters)
    } catch (error) {
      console.error('Error searching assets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleClearSearch = () => {
    setQuery('')
    setActiveFilters(null)
    setInterpretation('')
    setAssets([])
    setCurrentPage(1)
    setTotalPages(1)
    setTotalCount(0)
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    handleSearch(newPage)
  }


  return (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <Sidebar />
      <AppBar position="fixed" sx={{ zIndex: 1301, boxShadow: 'none' }}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Asset Visualizer
          </Typography>
          <ThemeToggle />
        </Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden', width: 'calc(100% - 240px)', ml: '240px', mt: 8 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={
            <MapView
              center={center}
              zoom={zoom}
              clusters={clusters}
              assets={assets}
              selectedAsset={selectedAsset}
              loadingAsset={loadingAsset}
              selectedCluster={selectedCluster}
              loading={loading}
              clusterAssets={clusterAssets}
              activeFilters={activeFilters}
              selectedAssetTypes={selectedAssetTypes}
              attributeFilters={attributeFilters}
              setSelectedAssetTypes={setSelectedAssetTypes}
              setAttributeFilters={setAttributeFilters}
              loadMapData={loadMapData}
              handleClusterClick={handleClusterClick}
              handleAssetClick={handleAssetClick}
              setSelectedAsset={setSelectedAsset}
              setSelectedCluster={setSelectedCluster}
              setClusterAssets={setClusterAssets}
              MapEvents={MapEvents}
            />
          } />
          <Route path="/assets" element={
            <Box sx={{ flexGrow: 1, p: 3 }}>
              <Typography variant="h4" gutterBottom>
                Assets
              </Typography>
              <AssetList
                assets={assets}
                onAssetClick={setSelectedAsset}
                loading={loading}
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                onPageChange={handlePageChange}
              />
            </Box>
          } />
        </Routes>
      </Box>
    </Box>
  )
}

export default App
