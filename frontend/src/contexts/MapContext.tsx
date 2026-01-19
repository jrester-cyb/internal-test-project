import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams, useLoaderData, useParams, useNavigation } from 'react-router-dom'
import { Box } from '@mui/material'
import type { Asset, AssetTypeAttribute, Cluster } from '@app/types'
import { searchAssets, fetchAssetTypes, getAsset, fetchAssetAttributeDefinitions, fetchRelatedAssets, fetchClusters, fetchTiles } from '@app/api/assets'
import { useLayout } from '@app/contexts/LayoutContext'
import MapDetailsDrawer from '@app/components/MapDetailsDrawer'
import FilterBuilder from '@app/components/FilterBuilder'
import type { AttributeFilter } from '@app/components/FilterBuilder'
import { getCachedFetch, cacheKeys, hashFilters } from '@app/utils/prefetchCache'

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
  // Map data state (owned by context, initialized from loader)
  assets: Asset[]
  clusters: Cluster[]
  center: [number, number]
  zoom: number
  bounds: number[] | null

  // Map data actions
  loadMapData: (bounds: number[], zoom: number) => void
  setCenter: (center: [number, number]) => void
  setZoom: (zoom: number) => void

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
  geometryTypeFilter: string[]
  setGeometryTypeFilter: (types: string[]) => void

  // Clustering state
  clusteringDisabled: boolean
  setClusteringDisabled: (disabled: boolean) => void

  // Filter building helper
  buildFilters: () => any[]

  // Drawer actions
  openAssetDrawer: (asset: Asset, attributes?: AssetTypeAttribute[]) => void
  openClusterDrawer: (cluster: Cluster) => void
  closeDrawer: () => void
  zoomToAsset: (asset: Asset) => void
  loadClusterAssetsRange: (startIndex: number, endIndex: number) => void

  // Prefetch actions (for hover prefetching)
  prefetchAsset: (asset: Asset) => void
  prefetchCluster: (cluster: Cluster) => void
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
  onZoomToAsset?: (asset: Asset) => void
}

export function MapProvider({ children, onZoomToAsset }: MapProviderProps) {
  const { organizationId, workspaceId } = useParams<{ organizationId: string; workspaceId?: string }>()
  const navigation = useNavigation()

  if (!organizationId) {
    throw new Error('MapProvider must be used within a route with organizationId parameter')
  }
  const [searchParams, setSearchParams] = useSearchParams()
  const loaderData = useLoaderData() as MapLoaderData | null
  const { sidebarOpen, isMobile } = useLayout()

  // Check if we're navigating away
  const isNavigating = navigation.state === 'loading'

  // Map data state - initialized from loader
  const [assets, setAssets] = useState<Asset[]>(loaderData?.initialAssets || [])
  const [clusters, setClusters] = useState<Cluster[]>(loaderData?.initialClusters || [])
  const [center, setCenter] = useState<[number, number]>(loaderData?.initialCenter || [39.0, -98.0])
  const [zoom, setZoom] = useState(loaderData?.initialZoom || 5)
  const [bounds, setBounds] = useState<number[] | null>(null)

  // Abort controller for canceling pending requests
  const abortControllerRef = useRef<AbortController | null>(null)

  // Calculate sidebar width for overlay positioning
  const sidebarWidth = isMobile ? 0 : (sidebarOpen ? 240 : 64)

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([])
  const [attributeFilters, setAttributeFilters] = useState<AttributeFilter[]>([])
  const [nameFilter, setNameFilter] = useState('')
  const [geometryTypeFilter, setGeometryTypeFilter] = useState<string[]>([])

  // Clustering state - persisted to localStorage
  const [clusteringDisabled, setClusteringDisabledState] = useState(() => {
    const saved = localStorage.getItem('clusteringDisabled')
    return saved ? JSON.parse(saved) : false
  })

  const setClusteringDisabled = useCallback((disabled: boolean) => {
    setClusteringDisabledState(disabled)
    localStorage.setItem('clusteringDisabled', JSON.stringify(disabled))
  }, [])



  // Cache for asset type names
  const assetTypeCache = useRef<AssetTypeCache>(new Map())
  const assetTypeCacheLoaded = useRef(false)

  // Load asset types into cache on mount
  useEffect(() => {
    if (!organizationId || assetTypeCacheLoaded.current) return

    fetchAssetTypes(organizationId, workspaceId, {})
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
  }, [organizationId, workspaceId])

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

  const organizationIdRef = useRef(organizationId)
  organizationIdRef.current = organizationId

  const workspaceIdRef = useRef(workspaceId)
  workspaceIdRef.current = workspaceId

  const boundsRef = useRef(bounds)
  boundsRef.current = bounds

  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const clusteringDisabledRef = useRef(clusteringDisabled)
  clusteringDisabledRef.current = clusteringDisabled

  const isNavigatingRef = useRef(isNavigating)
  isNavigatingRef.current = isNavigating

  const selectedAssetTypesRef = useRef(selectedAssetTypes)
  selectedAssetTypesRef.current = selectedAssetTypes

  const attributeFiltersRef = useRef(attributeFilters)
  attributeFiltersRef.current = attributeFilters

  const nameFilterRef = useRef(nameFilter)
  nameFilterRef.current = nameFilter

  const geometryTypeFilterRef = useRef(geometryTypeFilter)
  geometryTypeFilterRef.current = geometryTypeFilter

  // Ref for loadMapData to avoid dependency cycles
  const loadMapDataRef = useRef<((bounds: number[], zoom: number) => void) | null>(null)

  // Helper to build all filters for API requests
  const buildFilters = useCallback(() => {
    const currentSelectedAssetTypes = selectedAssetTypesRef.current
    const currentAttributeFilters = attributeFiltersRef.current
    const currentNameFilter = nameFilterRef.current
    const currentGeometryTypeFilter = geometryTypeFilterRef.current

    const filterGroups: any[] = []

    // Name filter
    if (currentNameFilter.trim()) {
      filterGroups.push({
        field: 'name',
        value: currentNameFilter.trim(),
        operator: 'icontains'
      })
    }

    // Geometry type filter (excluded types)
    if (currentGeometryTypeFilter.length > 0) {
      filterGroups.push({
        field: 'geometry_type',
        value: currentGeometryTypeFilter,
        operator: 'nin'
      })
    }

    // selectedAssetTypes now contains EXCLUDED type IDs
    // Add nin filter if any types are excluded
    if (currentSelectedAssetTypes.length > 0) {
      filterGroups.push({
        field: 'assetTypeId',
        value: currentSelectedAssetTypes,
        operator: 'nin'
      })
    }

    // Group attribute filters by asset type
    const attributesByType: Record<string, any[]> = {}
    currentAttributeFilters.forEach(af => {
      if (!attributesByType[af.assetTypeId]) {
        attributesByType[af.assetTypeId] = []
      }
      attributesByType[af.assetTypeId].push({
        field: `attributes.${af.attributeKey}`,
        value: af.value,
        operator: af.operator
      })
    })

    if (Object.keys(attributesByType).length > 0) {
      // Build OR group: (type1 exact AND its filters) OR (type2 exact AND its filters) OR (nin filtered types)
      const filteredTypeIds = Object.keys(attributesByType)
      const orFilters: any[] = []

      // Add filter groups for each type with attribute filters
      Object.entries(attributesByType).forEach(([typeId, attrFilters]) => {
        const typeFilters: any[] = [
          { field: 'assetTypeId', value: typeId, operator: 'exact' },
          ...attrFilters
        ]
        orFilters.push({ logic: 'AND', filters: typeFilters })
      })

      // Add a filter for asset types that are NOT being filtered (so they still appear)
      orFilters.push({
        field: 'assetTypeId',
        value: filteredTypeIds,
        operator: 'nin'
      })

      // Wrap in OR logic
      filterGroups.push({ logic: 'OR', filters: orFilters })
    }

    return filterGroups
  }, [])

  // Track if this is the first load (to allow loading even during navigation transition)
  const isFirstLoadRef = useRef(true)

  // Main data loading function - called on map move and filter changes
  const loadMapData = useCallback(async (newBounds: number[], newZoom: number) => {
    // Skip if navigating away, but allow the first load (navigation state might still be 'loading' when component mounts)
    if (isNavigatingRef.current && !isFirstLoadRef.current) {
      return
    }
    isFirstLoadRef.current = false

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // Store bounds for use in other parts of context
    setBounds(newBounds)

    const currentOrgId = organizationIdRef.current
    const currentWorkspaceId = workspaceIdRef.current
    const currentClusteringDisabled = clusteringDisabledRef.current

    if (!currentOrgId) return

    try {
      // Build filters from current filter state
      const filterGroups = buildFilters()
      let mergedFilters: any = null
      if (filterGroups.length > 0) {
        mergedFilters = {
          filters: filterGroups,
          logic: 'AND'
        }
      }

      // When clustering is disabled, always fetch tiles regardless of zoom level
      if (!currentClusteringDisabled && newZoom < 12) {
        const clusterData = await fetchClusters(currentOrgId, currentWorkspaceId, newZoom, newBounds, mergedFilters, abortController.signal)

        if (abortController.signal.aborted) return

        const geojsonAssets: Asset[] = []
        const realClusters: Cluster[] = []
        for (const c of clusterData.clusters) {
          if (c.type === 'Feature' && c.geometry && c.properties) {
            geojsonAssets.push({
              id: c.id,
              name: c.properties.name,
              assetType: c.properties.assetTypeId,
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
        // Fetch tiles with pagination
        setClusters([])

        const serverZoom = currentClusteringDisabled ? newZoom : undefined
        const pageSize = 250
        const parallelRequests = 3

        // Fetch first page to get total count
        const firstPageData = await fetchTiles(currentOrgId, currentWorkspaceId, newBounds, pageSize, mergedFilters, abortController.signal, 0, serverZoom)

        if (abortController.signal.aborted) return

        // Parse features
        const parseFeatures = (features: any[]): Asset[] => {
          return features.map(f => ({
            id: f.id,
            name: f.properties.name,
            assetType: f.properties.assetTypeId,
            h3Index: f.properties.h3Index,
            geometry: f.geometry
          }))
        }

        const firstBatch = parseFeatures(firstPageData.features)
        let allNewAssets = [...firstBatch]

        // Update UI with first batch immediately
        const newAssetIds = new Set(firstBatch.map(a => a.id))
        setAssets(prev => {
          const merged = [...prev.filter(a => !newAssetIds.has(a.id)), ...firstBatch]
          return merged
        })

        // Calculate remaining pages needed
        const total = firstPageData.total
        const remainingCount = total - firstPageData.features.length

        if (remainingCount > 0 && !abortController.signal.aborted) {
          const offsets: number[] = []
          for (let offset = pageSize; offset < total; offset += pageSize) {
            offsets.push(offset)
          }

          // Fetch remaining pages in parallel batches
          for (let i = 0; i < offsets.length && !abortController.signal.aborted; i += parallelRequests) {
            const batchOffsets = offsets.slice(i, i + parallelRequests)

            const batchPromises = batchOffsets.map(offset =>
              fetchTiles(currentOrgId, currentWorkspaceId, newBounds, pageSize, mergedFilters, abortController.signal, offset, serverZoom)
            )

            try {
              const batchResults = await Promise.all(batchPromises)

              if (abortController.signal.aborted) return

              const batchAssets: Asset[] = []
              for (const pageData of batchResults) {
                batchAssets.push(...parseFeatures(pageData.features))
              }

              allNewAssets = [...allNewAssets, ...batchAssets]
              const allNewIds = new Set(allNewAssets.map(a => a.id))

              setAssets(prev => {
                const merged = [...prev.filter(a => !allNewIds.has(a.id)), ...allNewAssets]
                return merged
              })
            } catch (error) {
              if (error instanceof Error && error.name === 'AbortError') {
                return
              }
              throw error
            }
          }
        }

        // After all pages loaded: remove stale assets
        if (!abortController.signal.aborted) {
          const finalIds = new Set(allNewAssets.map(a => a.id))
          setAssets(prev => prev.filter(a => finalIds.has(a.id)))
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      console.error('Error loading map data:', error)
    }
  }, [buildFilters])

  // Keep ref updated
  loadMapDataRef.current = loadMapData

  // Re-fetch when filters change (using stored bounds/zoom)
  // Note: We use loadMapDataRef to avoid infinite loops - loadMapData is NOT in deps
  useEffect(() => {
    // Skip on initial mount or if we don't have bounds yet
    const currentBounds = boundsRef.current
    if (!currentBounds || isNavigatingRef.current) return

    loadMapDataRef.current?.(currentBounds, zoomRef.current)
  }, [selectedAssetTypes, attributeFilters, nameFilter, geometryTypeFilter, clusteringDisabled])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

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
      const bounds = boundsRef.current
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

    // Add attribute filters (asset type, attribute values, name filter)
    const attributeFilterGroups = buildFilters()
    filters.push(...attributeFilterGroups)

    // Fetch initial count and first batch - use cached fetch for prefetch benefit
    const filterHash = hashFilters(filters)
    getCachedFetch(
      cacheKeys.clusterPrefetch(organizationId, workspaceId, cluster.h3Index, filterHash),
      () => searchAssets(organizationId, workspaceId, {
        filters,
        limit: 20,
        offset: 0
      })
    )
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
  }, [workspaceId, drawerState.isOpen, drawerState.content, buildFilters])

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
    const currentOrganizationId = organizationIdRef.current
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
      const bounds = boundsRef.current
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

    // Add attribute filters (asset type, attribute values, name filter)
    const attributeFilterGroups = buildFilters()
    filters.push(...attributeFilterGroups)

    // Fetch the specific range
    searchAssets(currentOrganizationId, currentWorkspaceId, {
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
  }, [buildFilters])

  // Prefetch asset data when hovering over a marker
  const prefetchAsset = useCallback((asset: Asset) => {
    const currentOrganizationId = organizationIdRef.current
    const currentWorkspaceId = workspaceIdRef.current

    if (!currentOrganizationId || !asset?.id) return

    // Prefetch the full asset details
    getCachedFetch(
      cacheKeys.assetPrefetch(currentOrganizationId, currentWorkspaceId, asset.id),
      () => getAsset(currentOrganizationId, currentWorkspaceId, asset.id)
    )

    // Prefetch attribute definitions if we have an asset type
    if (asset.assetType) {
      getCachedFetch(
        cacheKeys.assetAttributeDefinitions(currentOrganizationId, currentWorkspaceId, asset.assetType),
        () => fetchAssetAttributeDefinitions(currentOrganizationId, currentWorkspaceId, asset.assetType, 1, 20)
      )
    }

    // Prefetch related assets
    getCachedFetch(
      cacheKeys.relatedAssetsPrefetch(currentOrganizationId, currentWorkspaceId, asset.id),
      () => fetchRelatedAssets(currentOrganizationId, currentWorkspaceId, asset.id)
    )
  }, [])

  // Prefetch cluster data when hovering over a cluster marker
  const prefetchCluster = useCallback((cluster: Cluster) => {
    const currentOrganizationId = organizationIdRef.current
    const currentWorkspaceId = workspaceIdRef.current

    if (!currentOrganizationId) return

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
      const bounds = boundsRef.current
      if (bounds?.length === 4) {
        const [minLon, minLat, maxLon, maxLat] = bounds
        const bboxWkt = `POLYGON((${minLon} ${minLat}, ${maxLon} ${minLat}, ${maxLon} ${maxLat}, ${minLon} ${maxLat}, ${minLon} ${minLat}))`
        filters.push({
          field: 'geometry',
          value: bboxWkt,
          operator: 'intersects'
        })
      }
    }

    // Add attribute filters
    const attributeFilterGroups = buildFilters()
    filters.push(...attributeFilterGroups)

    // Prefetch the cluster assets - include filter hash in cache key
    const filterHash = hashFilters(filters)
    getCachedFetch(
      cacheKeys.clusterPrefetch(currentOrganizationId, currentWorkspaceId, cluster.h3Index, filterHash),
      () => searchAssets(currentOrganizationId, currentWorkspaceId, {
        filters,
        limit: 20,
        offset: 0
      })
    )
  }, [buildFilters])

  // Sync drawer state to URL
  useEffect(() => {
    // Don't update URL while navigating - this can cancel the pending navigation
    if (isNavigating) {
      return
    }

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
  }, [drawerState, setSearchParams, searchParams, isNavigating])

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
      // Map data state
      assets,
      clusters,
      center,
      zoom,
      bounds,
      // Map data actions
      loadMapData,
      setCenter,
      setZoom,
      // Drawer state
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
      geometryTypeFilter,
      setGeometryTypeFilter,
      clusteringDisabled,
      setClusteringDisabled,
      buildFilters,
      openAssetDrawer,
      openClusterDrawer,
      closeDrawer,
      zoomToAsset,
      loadClusterAssetsRange,
      prefetchAsset,
      prefetchCluster
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
          organizationId={organizationId}
          workspaceId={workspaceId}
          selectedAssetTypes={selectedAssetTypes}
          onAssetTypesChange={setSelectedAssetTypes}
          attributeFilters={attributeFilters}
          onAttributeFiltersChange={setAttributeFilters}
          nameFilter={nameFilter}
          onNameFilterChange={setNameFilter}
          geometryTypeFilter={geometryTypeFilter}
          onGeometryTypeFilterChange={setGeometryTypeFilter}
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
