import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams, useLoaderData } from 'react-router-dom'
import { Box } from '@mui/material'
import type { Asset, AssetTypeAttribute, Cluster } from '../types'
import { searchAssets, fetchAssetTypes } from '../api/assets'
import { useSidebar } from './SidebarContext'
import MapDetailsDrawer from '../components/MapDetailsDrawer'
import FilterBuilder from '../components/FilterBuilder'
import type { AttributeFilter } from '../components/FilterBuilder'

// Cache for asset type names: assetTypeId -> name
type AssetTypeCache = Map<string, string>

// Drawer data types - discriminated union for type safety
type AssetDrawerData = {
  type: 'asset'
  asset: Asset
  attributes?: AssetTypeAttribute[]
}

type ClusterDrawerData = {
  type: 'cluster'
  cluster: Cluster
  /** Sparse map of index -> asset */
  assets: Map<number, Asset>
  loading: boolean
  totalCount: number
  loadingMore: boolean
}

type DrawerContent = AssetDrawerData | ClusterDrawerData

interface DrawerState {
  isOpen: boolean
  content: DrawerContent | null
}

export type { DrawerContent }

// Loader data type from route
interface MapLoaderData {
  initialCenter: [number, number]
  initialZoom: number
  initialAssets: any[]
  initialClusters: any[]
  selectedAsset: Asset | null
  selectedAssetAttributes: AssetTypeAttribute[] | null
  selectedCluster: Cluster | null
  clusterAssets: Asset[] | null
  clusterTotalCount: number
}

interface MapContextType {
  // Drawer state
  drawerState: DrawerState

  // Selection state for map markers
  selectedAssetId: string | null
  selectedClusterId: string | null

  // Filter state
  filterOpen: boolean
  setFilterOpen: (open: boolean) => void
  selectedAssetTypes: string[]
  setSelectedAssetTypes: (types: string[]) => void
  attributeFilters: AttributeFilter[]
  setAttributeFilters: (filters: AttributeFilter[]) => void
  nameFilter: string
  setNameFilter: (name: string) => void

  // Drawer actions
  openAssetDrawer: (asset: Asset, attributes?: AssetTypeAttribute[]) => void
  openClusterDrawer: (cluster: Cluster) => void
  closeDrawer: () => void
  zoomToAsset: (asset: Asset) => void
  loadClusterAssetsRange: (startIndex: number, endIndex: number) => void
}

const MapContext = createContext<MapContextType | undefined>(undefined)

export function useMapContext() {
  const context = useContext(MapContext)
  if (!context) {
    throw new Error('useMapContext must be used within MapProvider')
  }
  return context
}

interface MapProviderProps {
  children: ReactNode
  organizationId: string
  workspaceId: string
  onZoomToAsset?: (asset: Asset) => void
  currentBounds?: number[] | null
}

export function MapProvider({ children, organizationId, workspaceId, onZoomToAsset, currentBounds }: MapProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const loaderData = useLoaderData() as MapLoaderData | null
  const { isOpen: sidebarOpen, isMobile } = useSidebar()

  // Calculate sidebar width for overlay positioning
  const sidebarWidth = isMobile ? 0 : (sidebarOpen ? 240 : 64)

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([])
  const [attributeFilters, setAttributeFilters] = useState<AttributeFilter[]>([])
  const [nameFilter, setNameFilter] = useState('')



  // Cache for asset type names
  const assetTypeCache = useRef<AssetTypeCache>(new Map())
  const assetTypeCacheLoaded = useRef(false)

  // Load asset types into cache on mount
  useEffect(() => {
    if (!workspaceId || assetTypeCacheLoaded.current) return

    fetchAssetTypes(workspaceId)
      .then(response => {
        const types = Array.isArray(response) ? response : response.results || []
        types.forEach((type: { id: string; name: string }) => {
          assetTypeCache.current.set(type.id, type.name)
        })
        assetTypeCacheLoaded.current = true
      })
      .catch(err => {
        console.error('Failed to load asset types for cache:', err)
      })
  }, [workspaceId])

  // Track if drawer was initially open from URL (to skip animation)
  const wasInitiallyOpen = Boolean(loaderData?.selectedAsset || loaderData?.selectedCluster)

  // Initialize drawer state from loader data
  const getInitialDrawerState = (): DrawerState => {
    if (loaderData?.selectedAsset) {
      return {
        isOpen: true,
        content: {
          type: 'asset',
          asset: loaderData.selectedAsset,
          attributes: loaderData.selectedAssetAttributes || undefined
        }
      }
    }
    if (loaderData?.selectedCluster) {
      // Convert array to Map
      const assetsMap = new Map<number, Asset>()
      loaderData.clusterAssets?.forEach((asset, index) => {
        assetsMap.set(index, asset)
      })
      return {
        isOpen: true,
        content: {
          type: 'cluster',
          cluster: loaderData.selectedCluster,
          assets: assetsMap,
          loading: false,
          totalCount: loaderData.clusterTotalCount || loaderData.clusterAssets?.length || 0,
          loadingMore: false
        }
      }
    }
    return { isOpen: false, content: null }
  }

  const [drawerState, setDrawerState] = useState<DrawerState>(getInitialDrawerState)

  // Refs to track values without causing callback recreation
  const drawerStateRef = useRef(drawerState)
  drawerStateRef.current = drawerState

  const workspaceIdRef = useRef(workspaceId)
  workspaceIdRef.current = workspaceId

  const currentBoundsRef = useRef(currentBounds)
  currentBoundsRef.current = currentBounds

  const openAssetDrawer = useCallback((asset: Asset, attributes?: AssetTypeAttribute[]) => {
    // Enrich asset with cached asset type name if not already present
    const enrichedAsset = { ...asset }
    if (!enrichedAsset.assetTypeName && enrichedAsset.assetType) {
      const cachedName = assetTypeCache.current.get(enrichedAsset.assetType)
      enrichedAsset.assetTypeName = cachedName || 'Loading...'
    }

    // Set location from Point geometry if not already present
    if (!enrichedAsset.location && asset.geometry?.type === 'Point' && Array.isArray(asset.geometry.coordinates) && asset.geometry.coordinates.length === 2) {
      enrichedAsset.location = {
        type: 'Point',
        coordinates: asset.geometry.coordinates
      }
    }

    setDrawerState({
      isOpen: true,
      content: {
        type: 'asset',
        asset: enrichedAsset,
        attributes
      }
    })
    // Note: effective width will be updated by PvDrawer's animation tracking
  }, [])

  const openClusterDrawer = useCallback((cluster: Cluster) => {
    // Skip if this cluster is already open
    if (drawerState.isOpen &&
        drawerState.content?.type === 'cluster' &&
        drawerState.content.cluster.h3Index === cluster.h3Index) {
      return
    }

    // Set loading state - will fetch initial items via onLoadRange
    setDrawerState({
      isOpen: true,
      content: {
        type: 'cluster',
        cluster,
        assets: new Map(),
        loading: true,
        totalCount: 0,
        loadingMore: false
      }
    })
    // Note: effective width will be updated by PvDrawer's animation tracking

    // Build filters based on whether cluster has a specific bbox (client-side cluster)
    // or needs to use h3 prefix (server-side cluster)
    const filters: any[] = []

    if (cluster.bbox) {
      // Client-side cluster with precise bbox - use geometry intersects only
      const [minLon, minLat, maxLon, maxLat] = cluster.bbox
      const bboxWkt = `POLYGON((${minLon} ${minLat}, ${maxLon} ${minLat}, ${maxLon} ${maxLat}, ${minLon} ${maxLat}, ${minLon} ${minLat}))`
      filters.push({
        field: 'geometry',
        value: bboxWkt,
        operator: 'intersects'
      })
    } else {
      // Server-side cluster - use h3 prefix + optional map bounds
      filters.push({
        field: 'h3_index',
        value: cluster.h3Index,
        operator: 'startswith'
      })
      // Use ref to get latest bounds value
      const bounds = currentBoundsRef.current
      if (bounds?.length === 4) {
        // Convert bbox to WKT polygon for geometry intersects filter
        const [minLon, minLat, maxLon, maxLat] = bounds
        const bboxWkt = `POLYGON((${minLon} ${minLat}, ${maxLon} ${minLat}, ${maxLon} ${maxLat}, ${minLon} ${maxLat}, ${minLon} ${minLat}))`
        filters.push({
          field: 'geometry',
          value: bboxWkt,
          operator: 'intersects'
        })
      }
    }

    // Fetch initial count and first batch
    searchAssets(workspaceId, {
      filters,
      limit: 20,
      offset: 0
    })
      .then(results => {
        setDrawerState(prev => {
          if (prev.content?.type === 'cluster' && prev.content.cluster.h3Index === cluster.h3Index) {
            const newAssets = new Map(prev.content.assets)
            results.results?.forEach((asset: Asset, index: number) => {
              newAssets.set(index, asset)
            })
            return {
              ...prev,
              content: {
                ...prev.content,
                assets: newAssets,
                loading: false,
                totalCount: results.count || 0,
                loadingMore: false
              }
            }
          }
          return prev
        })
      })
      .catch(err => {
        console.error('Failed to load cluster assets:', err)
        setDrawerState(prev => {
          if (prev.content?.type === 'cluster') {
            return {
              ...prev,
              content: {
                ...prev.content,
                loading: false,
                loadingMore: false
              }
            }
          }
          return prev
        })
      })
  }, [workspaceId, drawerState.isOpen, drawerState.content])

  const closeDrawer = useCallback(() => {
    setDrawerState(prev => ({
      ...prev,
      isOpen: false
    }))
    // Note: effective width will be updated by PvDrawer's animation tracking
  }, [])

  const zoomToAsset = useCallback((asset: Asset) => {
    onZoomToAsset?.(asset)
  }, [onZoomToAsset])

  const loadClusterAssetsRange = useCallback((startIndex: number, endIndex: number) => {
    // Read from ref to avoid dependency on drawerState
    const currentContent = drawerStateRef.current.content
    const currentWorkspaceId = workspaceIdRef.current

    // Only load if we have a cluster drawer open
    if (currentContent?.type !== 'cluster') return
    // Skip if already loading (initial load or loading more)
    if (currentContent.loading || currentContent.loadingMore) return

    const cluster = currentContent.cluster
    const limit = endIndex - startIndex + 1

    // Set loading more state
    setDrawerState(prev => {
      if (prev.content?.type === 'cluster') {
        return {
          ...prev,
          content: {
            ...prev.content,
            loadingMore: true
          }
        }
      }
      return prev
    })

    // Build filters based on whether cluster has a specific bbox (client-side cluster)
    // or needs to use h3 prefix (server-side cluster)
    const filters: any[] = []

    if (cluster.bbox) {
      // Client-side cluster with precise bbox - use geometry intersects only
      const [minLon, minLat, maxLon, maxLat] = cluster.bbox
      const bboxWkt = `POLYGON((${minLon} ${minLat}, ${maxLon} ${minLat}, ${maxLon} ${maxLat}, ${minLon} ${maxLat}, ${minLon} ${minLat}))`
      filters.push({
        field: 'geometry',
        value: bboxWkt,
        operator: 'intersects'
      })
    } else {
      // Server-side cluster - use h3 prefix + optional map bounds
      filters.push({
        field: 'h3_index',
        value: cluster.h3Index,
        operator: 'startswith'
      })
      const bounds = currentBoundsRef.current
      if (bounds?.length === 4) {
        // Convert bbox to WKT polygon for geometry intersects filter
        const [minLon, minLat, maxLon, maxLat] = bounds
        const bboxWkt = `POLYGON((${minLon} ${minLat}, ${maxLon} ${minLat}, ${maxLon} ${maxLat}, ${minLon} ${maxLat}, ${minLon} ${minLat}))`
        filters.push({
          field: 'geometry',
          value: bboxWkt,
          operator: 'intersects'
        })
      }
    }

    // Fetch the specific range
    searchAssets(currentWorkspaceId, {
      filters,
      limit,
      offset: startIndex
    })
      .then(results => {
        setDrawerState(prev => {
          if (prev.content?.type === 'cluster' && prev.content.cluster.h3Index === cluster.h3Index) {
            // Create new Map with existing items plus new items
            const newAssets = new Map(prev.content.assets)
            results.results?.forEach((asset: Asset, index: number) => {
              newAssets.set(startIndex + index, asset)
            })
            return {
              ...prev,
              content: {
                ...prev.content,
                assets: newAssets,
                totalCount: results.count || prev.content.totalCount,
                loadingMore: false
              }
            }
          }
          return prev
        })
      })
      .catch(err => {
        console.error('Failed to load cluster assets range:', err)
        setDrawerState(prev => {
          if (prev.content?.type === 'cluster') {
            return {
              ...prev,
              content: {
                ...prev.content,
                loadingMore: false
              }
            }
          }
          return prev
        })
      })
  }, [])

  // Sync drawer state to URL
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams)

    if (drawerState.isOpen && drawerState.content) {
      if (drawerState.content.type === 'asset') {
        newParams.set('assetId', drawerState.content.asset.id)
        newParams.delete('clusterId')
      } else if (drawerState.content.type === 'cluster') {
        newParams.set('clusterId', drawerState.content.cluster.h3Index)
        newParams.delete('assetId')
      }
    } else {
      newParams.delete('assetId')
      newParams.delete('clusterId')
    }

    setSearchParams(newParams, { replace: true })
  }, [drawerState, setSearchParams, searchParams])

  // Build drawer props based on content type
  const getDrawerProps = () => {
    const { content } = drawerState
    if (!content) return null

    const baseProps = {
      isOpen: drawerState.isOpen,
      onClose: closeDrawer,
      organizationId,
      workspaceId,
      initiallyOpen: wasInitiallyOpen
    }

    if (content.type === 'asset') {
      return {
        ...baseProps,
        type: 'asset' as const,
        asset: content.asset,
        attributes: content.attributes,
        onZoomToAsset: zoomToAsset
      }
    }

    return {
      ...baseProps,
      type: 'cluster' as const,
      cluster: content.cluster,
      assets: content.assets,
      loading: content.loading,
      loadingMore: content.loadingMore,
      totalCount: content.totalCount,
      onAssetClick: openAssetDrawer,
      onZoomToAsset: zoomToAsset,
      onLoadRange: loadClusterAssetsRange
    }
  }

  const drawerProps = getDrawerProps()

  // Derive selection state from drawer content
  const selectedAssetId = drawerState.isOpen && drawerState.content?.type === 'asset'
    ? drawerState.content.asset.id
    : null
  const selectedClusterId = drawerState.isOpen && drawerState.content?.type === 'cluster'
    ? drawerState.content.cluster.h3Index
    : null

  return (
    <MapContext.Provider value={{
      drawerState,
      selectedAssetId,
      selectedClusterId,
      filterOpen,
      setFilterOpen,
      selectedAssetTypes,
      setSelectedAssetTypes,
      attributeFilters,
      setAttributeFilters,
      nameFilter,
      setNameFilter,
      openAssetDrawer,
      openClusterDrawer,
      closeDrawer,
      zoomToAsset,
      loadClusterAssetsRange
    }}>
      {children}
      <Box
        sx={{
          position: 'fixed',
          top: 64,  // AppBar height
          left: sidebarWidth,
          right: 0,
          bottom: isMobile ? 56 : 0,  // Bottom nav height on mobile
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 1000,
          transition: 'left 225ms cubic-bezier(0.4, 0, 0.6, 1)',
        }}
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
        {drawerProps && (
          <MapDetailsDrawer
            {...drawerProps}
          />
        )}
      </Box>
    </MapContext.Provider>
  )
}
