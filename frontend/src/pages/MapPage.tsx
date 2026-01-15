import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useLoaderData } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { getAsset } from '../api/assets'
import { fetchClusters, fetchTiles, searchAssets, interpretSearch } from '../api/assets'
import type { Asset, Cluster } from '../types'
import type { AttributeFilter } from '../components/FilterBuilder'
import MapView from '../components/MapView'
import MapEvents from '../components/MapEvents'

// Fix for default marker icon in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function MapPage() {
  const { organizationId, workspaceId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const loaderData = useLoaderData() as {
    initialCenter: [number, number]
    initialZoom: number
    initialAssets: any[]
    initialClusters: any[]
    selectedAsset: any
  } | null

  // Use loader data for initial state
  const [center, setCenter] = useState<[number, number]>(loaderData?.initialCenter || [29.9511, -90.0715])
  const [zoom, setZoom] = useState(loaderData?.initialZoom || 10)
  const [assets, setAssets] = useState<any[]>(loaderData?.initialAssets || [])
  const [clusters, setClusters] = useState<any[]>(loaderData?.initialClusters || [])
  const [selectedAsset, setSelectedAsset] = useState<any>(loaderData?.selectedAsset || null)
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
  const [nameFilter, setNameFilter] = useState('')

  const initialUrlUpdateDone = useRef(false)

  const loadMapData = useCallback(async (bounds: number[], zoom: number, filters?: any) => {
    if (!workspaceId) return

    setLoading(true)
    try {
      // Merge asset type and attribute filters with other filters
      let mergedFilters = filters ? { ...filters } : null
      const filterGroups: any[] = []

      // Add name filter if present
      if (nameFilter.trim()) {
        filterGroups.push({
          field: 'name',
          value: nameFilter.trim(),
          operator: 'icontains'
        })
      }

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
        const clusterData = await fetchClusters(workspaceId, zoom, bounds, mergedFilters)
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
        const tileData = await fetchTiles(workspaceId, bounds, 5000, mergedFilters)
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
  }, [workspaceId, selectedAssetTypes, attributeFilters, nameFilter])

  // Update URL when map position or selected asset changes
  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('lat', center[0].toFixed(6))
    newSearchParams.set('lng', center[1].toFixed(6))
    newSearchParams.set('zoom', zoom.toString())

    if (selectedAsset) {
      newSearchParams.set('assetId', selectedAsset.id)
    } else {
      // On initial load, don't delete assetId if it exists (it will be loaded)
      if (!initialUrlUpdateDone.current && searchParams.get('assetId')) {
        // Keep the assetId for now
      } else {
        newSearchParams.delete('assetId')
      }
    }

    setSearchParams(newSearchParams, { replace: true })
    initialUrlUpdateDone.current = true
  }, [center, zoom, selectedAsset, setSearchParams, searchParams])

  const handleClusterClick = async (cluster: Cluster) => {
    if (!workspaceId) return
    setSelectedCluster(cluster)
    setLoading(true)
    try {
      const results = await searchAssets(workspaceId, {
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
    if (!workspaceId) return
    setLoadingAsset(true)
    try {
      const fullAsset = await getAsset(workspaceId, asset.id)
      setSelectedAsset(fullAsset)
    } catch (error) {
      setSelectedAsset(asset)
      console.error('Error fetching asset details:', error)
    } finally {
      setLoadingAsset(false)
    }
  }

  const handleSearch = async (page: number = 1) => {
    if (!workspaceId || !query.trim()) {
      // Clear filters
      setActiveFilters(null)
      setInterpretation('')
      return
    }

    setLoading(true)
    try {
      // First, interpret the natural language query
      const interpreted = await interpretSearch(workspaceId, query)
      setInterpretation(interpreted.interpretation || '')

      const filters = {
        filters: interpreted.filters,
        logic: interpreted.logic || 'AND'
      }

      const results = await searchAssets(workspaceId, {
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
    <MapView
      organizationId={organizationId || ''}
      workspaceId={workspaceId || ''}
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
      nameFilter={nameFilter}
      setSelectedAssetTypes={setSelectedAssetTypes}
      setAttributeFilters={setAttributeFilters}
      setNameFilter={setNameFilter}
      loadMapData={loadMapData}
      handleClusterClick={handleClusterClick}
      handleAssetClick={handleAssetClick}
      setSelectedAsset={setSelectedAsset}
      setSelectedCluster={setSelectedCluster}
      setClusterAssets={setClusterAssets}
      onCenterChange={setCenter}
      onZoomChange={setZoom}
      MapEvents={MapEvents}
    />
  )
}

export default MapPage