import { useState, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { AppBar, Toolbar, Button, TextField, Box, CircularProgress, Typography, IconButton } from '@mui/material'
import { Search as SearchIcon, Clear as ClearIcon } from '@mui/icons-material'
import AssetDetails from './components/AssetDetails'
import ClusterMarkers from './components/ClusterMarkers'
import { fetchClusters, fetchTiles, searchAssets, interpretSearch } from './api/assets'
import type { Asset, Cluster } from './types'

// Fix for default marker icon in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Component to handle map events - outside App to prevent recreation
function MapEvents({ onLoadData, filters }: { onLoadData: (bounds: number[], zoom: number, filters?: any) => void, filters?: any }) {
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
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [clusterAssets, setClusterAssets] = useState<Asset[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [activeFilters, setActiveFilters] = useState<any>(null)
  const [interpretation, setInterpretation] = useState<string>('')

  const loadMapData = useCallback(async (bounds: number[], zoom: number, filters?: any) => {
    setLoading(true)
    try {
      if (zoom < 12) {
        // Show clusters at high zoom out
        const clusterData = await fetchClusters(zoom, bounds, filters)
        setClusters(clusterData.clusters)
        setAssets([])
      } else {
        // Show individual assets when zoomed in
        const tileData = await fetchTiles(bounds, 5000, filters)
        setAssets(tileData.features.map((f: any) => ({
          id: f.id,
          name: f.properties.name,
          assetTypeId: f.properties.assetTypeId,
          geohash: f.properties.geohash,
          geometry: f.geometry
        })))
        setClusters([])
      }
    } catch (error) {
      console.error('Error loading map data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleClusterClick = async (cluster: Cluster) => {
    setSelectedCluster(cluster)
    setLoading(true)
    try {
      const results = await searchAssets({
        filters: [{
          field: 'geohash',
          value: cluster.geohash,
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

  const handleAssetClick = (asset: Asset) => {
    setSelectedAsset(asset)
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
      <AppBar position="fixed" sx={{ zIndex: 1300 }}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Asset Visualizer
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden', width: '100%', mt: 8 }}>
        <Box sx={{ flexGrow: 1, position: 'relative' }}>
          <MapContainer
            center={center}
            zoom={zoom}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapEvents onLoadData={loadMapData} filters={activeFilters} />

            <ClusterMarkers
              clusters={clusters}
              onClusterClick={handleClusterClick}
            />

            {assets.map(asset => (
              asset.geometry && asset.geometry.type === "Point" && Array.isArray(asset.geometry.coordinates) && asset.geometry.coordinates.length === 2 && (
                <Marker
                  key={asset.id}
                  position={[asset.geometry.coordinates[1], asset.geometry.coordinates[0]]}
                  eventHandlers={{
                    click: () => handleAssetClick(asset)
                  }}
                />
              )
            ))}
          </MapContainer>

          {loading && (
            <Box sx={{ position: 'absolute', top: 16, right: 16, bgcolor: 'white', p: 2, borderRadius: 1, boxShadow: 2, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={20} />
              <Typography>Loading...</Typography>
            </Box>
          )}
        </Box>

        {selectedAsset && (
          <AssetDetails
            asset={selectedAsset}
            onClose={() => setSelectedAsset(null)}
          />
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

              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ backgroundColor: '#f5f5f5' }}>
                      <tr>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>
                          Name
                        </th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>
                          Type
                        </th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>
                          Attributes
                        </th>
                      </tr>
                    </thead>
                    <tbody style={{ backgroundColor: 'white' }}>
                      {clusterAssets?.map(asset => (
                        <tr
                          key={asset.id}
                          style={{ cursor: 'pointer', borderBottom: '1px solid #e0e0e0' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                          onClick={() => {
                            setSelectedAsset(asset)
                            setSelectedCluster(null)
                          }}
                        >
                          <td style={{ padding: '16px', whiteSpace: 'nowrap', fontSize: '14px', fontWeight: 500 }}>
                            {asset.name}
                          </td>
                          <td style={{ padding: '16px', whiteSpace: 'nowrap', fontSize: '14px', color: '#666' }}>
                            {asset.assetTypeId}
                          </td>
                          <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>
                            {asset.attributes && Object.keys(asset.attributes).length > 0 ? (
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {Object.entries(asset.attributes).slice(0, 3).map(([key, value]) => (
                                  <Box key={key} sx={{ display: 'flex', gap: 1 }}>
                                    <Typography component="span" sx={{ fontWeight: 600 }}>{key}:</Typography>
                                    <Typography component="span">{String(value)}</Typography>
                                  </Box>
                                ))}
                                {Object.keys(asset.attributes).length > 3 && (
                                  <Typography variant="caption" color="text.secondary">
                                    +{Object.keys(asset.attributes).length - 3} more
                                  </Typography>
                                )}
                              </Box>
                            ) : (
                              <Typography color="text.secondary">No attributes</Typography>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Query Overlay at Bottom */}
      <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(33, 33, 33, 0.95)', backdropFilter: 'blur(8px)', p: 2, zIndex: 1300 }}>
        <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
          {interpretation && (
            <Box sx={{ mb: 1, px: 1 }}>
              <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                Searching: {interpretation}
              </Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              fullWidth
              size="small"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search assets (e.g., 'restaurants in French Quarter', 'hotels near downtown')..."
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: 'white',
                  backgroundColor: 'rgba(255, 255, 255, 0.09)',
                  '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.23)' },
                  '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.4)' },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main' }
                },
                '& .MuiInputBase-input::placeholder': { color: 'rgba(255, 255, 255, 0.5)' }
              }}
            />
            <Button
              variant="contained"
              startIcon={<SearchIcon />}
              onClick={() => handleSearch()}
              disabled={!query.trim() || loading}
            >
              {loading ? 'Searching...' : 'Search'}
            </Button>
            {query && (
              <Button
                variant="outlined"
                color="inherit"
                sx={{ color: 'white', borderColor: 'rgba(255, 255, 255, 0.23)' }}
                onClick={handleClearSearch}
              >
                Clear
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

export default App
