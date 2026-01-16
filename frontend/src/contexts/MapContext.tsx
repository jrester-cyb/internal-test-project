import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams, useLoaderData } from 'react-router-dom'
import type { Asset, AssetTypeAttribute, Cluster } from '../types'
import { searchAssets, fetchAssetTypes, fetchPaginationUrl } from '../api/assets'
import MapDetailsDrawer from '../components/MapDetailsDrawer'

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
  assets: Asset[]
  loading: boolean
  // Pagination state
  nextUrl: string | null
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
}

interface MapContextType {
  // Drawer state
  drawerState: DrawerState

  // Drawer actions
  openAssetDrawer: (asset: Asset, attributes?: AssetTypeAttribute[]) => void
  openClusterDrawer: (cluster: Cluster) => void
  closeDrawer: () => void
  zoomToAsset: (asset: Asset) => void
  loadMoreClusterAssets: () => void
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
}

export function MapProvider({ children, organizationId, workspaceId, onZoomToAsset }: MapProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const loaderData = useLoaderData() as MapLoaderData | null

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
      return {
        isOpen: true,
        content: {
          type: 'cluster',
          cluster: loaderData.selectedCluster,
          assets: loaderData.clusterAssets || [],
          loading: false,
          nextUrl: null,
          totalCount: loaderData.clusterAssets?.length || 0,
          loadingMore: false
        }
      }
    }
    return { isOpen: false, content: null }
  }

  const [drawerState, setDrawerState] = useState<DrawerState>(getInitialDrawerState)

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
  }, [])

  const openClusterDrawer = useCallback((cluster: Cluster) => {
    // Skip if this cluster is already open
    if (drawerState.isOpen &&
        drawerState.content?.type === 'cluster' &&
        drawerState.content.cluster.h3Index === cluster.h3Index) {
      return
    }

    // Set loading state and fetch assets
    setDrawerState({
      isOpen: true,
      content: {
        type: 'cluster',
        cluster,
        assets: [],
        loading: true,
        nextUrl: null,
        totalCount: 0,
        loadingMore: false
      }
    })

    // Fetch cluster assets (first page)
    searchAssets(workspaceId, {
      filters: [{
        field: 'h3_index',
        value: cluster.h3Index,
        operator: 'startswith'
      }],
      page: 1,
      limit: 20
    })
      .then(results => {
        setDrawerState(prev => {
          if (prev.content?.type === 'cluster' && prev.content.cluster.h3Index === cluster.h3Index) {
            return {
              ...prev,
              content: {
                ...prev.content,
                assets: results.results || [],
                loading: false,
                nextUrl: results.next || null,
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
  }, [])

  const zoomToAsset = useCallback((asset: Asset) => {
    onZoomToAsset?.(asset)
  }, [onZoomToAsset])

  // Ref to track drawer state for loadMoreClusterAssets without causing recreation
  const drawerStateRef = useRef(drawerState)
  drawerStateRef.current = drawerState

  const loadMoreClusterAssets = useCallback(() => {
    // Read from ref to avoid dependency on drawerState
    const currentContent = drawerStateRef.current.content

    // Only load more if we have a cluster drawer open with a next URL
    if (currentContent?.type !== 'cluster') return
    if (currentContent.loading || currentContent.loadingMore) return
    if (!currentContent.nextUrl) return

    const cluster = currentContent.cluster
    const nextUrl = currentContent.nextUrl

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

    // Fetch next page using the next URL
    fetchPaginationUrl(nextUrl)
      .then(results => {
        setDrawerState(prev => {
          if (prev.content?.type === 'cluster' && prev.content.cluster.h3Index === cluster.h3Index) {
            return {
              ...prev,
              content: {
                ...prev.content,
                assets: [...prev.content.assets, ...(results.results || [])],
                nextUrl: results.next || null,
                totalCount: results.count || prev.content.totalCount,
                loadingMore: false
              }
            }
          }
          return prev
        })
      })
      .catch(err => {
        console.error('Failed to load more cluster assets:', err)
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
      workspaceId
    }

    if (content.type === 'asset') {
      return {
        ...baseProps,
        type: 'asset' as const,
        asset: content.asset,
        attributes: content.attributes
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
      onLoadMore: content.nextUrl ? loadMoreClusterAssets : undefined
    }
  }

  const drawerProps = getDrawerProps()

  return (
    <MapContext.Provider value={{
      drawerState,
      openAssetDrawer,
      openClusterDrawer,
      closeDrawer,
      zoomToAsset,
      loadMoreClusterAssets
    }}>
      {children}
      {drawerProps && <MapDetailsDrawer {...drawerProps} />}
    </MapContext.Provider>
  )
}
