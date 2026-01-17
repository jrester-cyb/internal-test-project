import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider, type Params } from 'react-router-dom'
import { ThemeProvider } from '@app/contexts/ThemeContext'
import { OrganizationProvider } from '@app/contexts/OrganizationContext'
import { SidebarProvider } from '@app/contexts/SidebarContext'
import { ChoicesProvider } from '@app/contexts/ChoicesContext'
import './index.css'
import App from '@app/App'

// Lazy load route components
const OrganizationsPage = lazy(() => import('./pages/OrganizationsPage.tsx'))
const OrganizationLandingPage = lazy(() => import('./pages/OrganizationLandingPage.tsx'))
const OrganizationSettingsPage = lazy(() => import('./pages/OrganizationSettingsPage.tsx'))
const ManageWorkspacesPage = lazy(() => import('./pages/ManageWorkspacesPage.tsx'))
const WorkspaceLayout = lazy(() => import('./pages/WorkspaceLayout.tsx'))
const WorkspaceSettingsPage = lazy(() => import('./pages/WorkspaceSettingsPage.tsx'))
const AssetTypesPage = lazy(() => import('./pages/AssetTypesPage.tsx'))
const MapPage = lazy(() => import('./pages/MapPage.tsx'))
const AssetGridPage = lazy(() => import('./pages/AssetGridPage.tsx'))
const AssetDetailPage = lazy(() => import('./pages/AssetDetailPage.tsx'))
const AssetTypeLayout = lazy(() => import('./pages/AssetTypeLayout.tsx'))
const AssetTypeAboutPage = lazy(() => import('./pages/AssetTypeAboutPage.tsx'))
const AssetTypeAttributesPage = lazy(() => import('./pages/AssetTypeAttributesPage.tsx'))
const LibraryPage = lazy(() => import('./pages/LibraryPage.tsx'))

// Generic lazy loader wrapper
function createLazyLoader(
  importPath: string,
  functionName: string,
  config?: {
    paramExtractor?: (params: Params<string>) => Params<string> | string | undefined,
    transformer?: (data: any, extractedParams?: any, request?: any) => any,
  }
) {
  return async ({ params }: { params: any; request: any }) => {
    const module = await import(importPath);
    // Extract the parameters using the provided extractor function, or pass all params
    const extractedParams = config?.paramExtractor ? config.paramExtractor(params) : params
    const data = await module[functionName](extractedParams)
    return config?.transformer ? config.transformer(data, extractedParams) : data
  }
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <OrganizationsPage />,
        handle: {
          crumb: "Organizations",
          hideSidebar: true
        },
      },
      {
        path: "organizations/:organizationId",
        children: [
          {
            index: true,
            element: <Navigate to="map" replace />,
          },
          {
            path: "map",
            element: <MapPage />,
            handle: {
              crumb: "Map",
              hideBreadcrumbs: true
            },
          },
          {
            path: "library",
            handle: {
              crumb: "Library"
            },
            children: [
              {
                index: true,
                element: <LibraryPage />,
                loader: async ({ params }) => {
                  const { fetchFileTree } = await import('./api/assets')
                  // TODO: Update to fetch organization-level file tree
                  return fetchFileTree(params.organizationId!)
                },
              },
              {
                path: ":directoryId",
                element: <LibraryPage />,
                loader: async ({ params }) => {
                  const { fetchFileTree } = await import('./api/assets')
                  // TODO: Update to fetch organization-level file tree
                  return fetchFileTree(params.organizationId!, params.directoryId)
                },
              },
            ],
          },
          {
            path: "asset-types",
            handle: {
              crumb: "Asset Types"
            },
            children: [
              {
                index: true,
                element: <AssetTypesPage />,
                loader: async ({ params }) => {
                  const { fetchAssetTypes } = await import('./api/assets')
                  // TODO: Update to fetch organization-level asset types
                  const data = await fetchAssetTypes(params.organizationId!)
                  return Array.isArray(data) ? data : data.results || []
                },
              },
            ],
          },
          {
            path: "workspaces",
            element: <ManageWorkspacesPage />,
            handle: {
              crumb: "Manage Workspaces"
            },
          },
        ],
      },
      {
        id: "workspace-route",
        path: "organizations/:organizationId/workspaces/:workspaceId",
        element: <WorkspaceLayout />,
        loader: async ({ params }) => {
          const { fetchWorkspace } = await import('./api/assets')
          const workspace = await fetchWorkspace(params.workspaceId!)
          return workspace
        },
        shouldRevalidate: ({ currentParams, nextParams }) => {
          // Only reload if we're changing to a different workspace
          return currentParams.workspaceId !== nextParams.workspaceId
        },
        handle: {
          crumb: (data: any) => data?.loaderData?.name || 'Workspace'
        },
        children: [
          {
            index: true,
            element: <Navigate to="map" replace />,
          },
          {
            path: "map",
            element: <MapPage />,
            loader: async ({ params, request }) => {
              const { organizationId, workspaceId } = params
              if (!organizationId || !workspaceId) return null

              const url = new URL(request.url)
              const searchParams = url.searchParams

              // Get initial position from URL or localStorage
              const getInitialPosition = () => {
                const urlLat = searchParams.get('lat')
                const urlLng = searchParams.get('lng')
                const urlZoom = searchParams.get('zoom')

                if (urlLat && urlLng && urlZoom) {
                  return {
                    center: [parseFloat(urlLat), parseFloat(urlLng)] as [number, number],
                    zoom: parseInt(urlZoom, 10)
                  }
                }

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

              const { center, zoom } = getInitialPosition()

              // Load initial assets
              const { fetchClusters, fetchTiles, getAsset, fetchAssetAttributeDefinitions } = await import('./api/assets')

              let assets: any[] = []
              let clusters: any[] = []
              let selectedAsset = null
              let selectedAssetAttributes = null
              // Calculate bounds for initial load (rough estimate)
              const latDiff = 0.01 * Math.pow(2, 10 - zoom) // Rough bounds calculation
              const lngDiff = latDiff * Math.cos(center[0] * Math.PI / 180)
              const bounds = [
                center[0] - latDiff, // south
                center[1] - lngDiff, // west  
                center[0] + latDiff, // north
                center[1] + lngDiff  // east
              ]

              try {
                if (zoom < 12) {
                  const clusterData = await fetchClusters(workspaceId, zoom, bounds)
                  const geojsonAssets: any[] = []
                  const realClusters: any[] = []
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
                  clusters = realClusters
                  assets = geojsonAssets
                } else {
                  const tileData = await fetchTiles(workspaceId, bounds, 5000)
                  assets = tileData.features.map((f: any) => ({
                    id: f.id,
                    name: f.properties.name,
                    assetTypeId: f.properties.assetTypeId,
                    h3Index: f.properties.h3Index,
                    geometry: f.geometry
                  }))
                  clusters = []
                }

                // Load selected asset if present in URL
                const assetId = searchParams.get('assetId')
                if (assetId) {
                  try {
                    selectedAsset = await getAsset(workspaceId, assetId)
                    // Load attributes for the selected asset
                    if (selectedAsset?.assetType) {
                      try {
                        const attrsResponse = await fetchAssetAttributeDefinitions(workspaceId, selectedAsset.assetType)
                        selectedAssetAttributes = attrsResponse.results || []
                      } catch (error) {
                        console.error('Error loading selected asset attributes:', error)
                      }
                    }
                  } catch (error) {
                    console.error('Error loading selected asset:', error)
                  }
                }
              } catch (error) {
                console.error('Error loading initial map data:', error)
              }

              // Load cluster assets if clusterId present in URL
              let selectedCluster = null
              let clusterAssets: any[] = []
              let clusterTotalCount = 0
              const clusterId = searchParams.get('clusterId')
              if (clusterId) {
                const { searchAssets } = await import('./api/assets')
                try {
                  const results = await searchAssets(workspaceId, {
                    filters: [{
                      field: 'h3_index',
                      value: clusterId,
                      operator: 'startswith'
                    }],
                    limit: 20,
                    offset: 0
                  })
                  clusterAssets = results.results || []
                  clusterTotalCount = results.count || clusterAssets.length

                  // Calculate center from first asset's coordinates if available
                  let clusterCenter = { lat: center[0], lon: center[1] }
                  if (clusterAssets.length > 0) {
                    const firstAsset = clusterAssets[0]
                    if (firstAsset.geometry?.type === 'Point' && firstAsset.geometry.coordinates) {
                      clusterCenter = {
                        lat: firstAsset.geometry.coordinates[1],
                        lon: firstAsset.geometry.coordinates[0]
                      }
                    } else if (firstAsset.location?.coordinates) {
                      clusterCenter = {
                        lat: firstAsset.location.coordinates[1],
                        lon: firstAsset.location.coordinates[0]
                      }
                    }
                  }

                  selectedCluster = {
                    h3Index: clusterId,
                    count: clusterTotalCount,
                    center: clusterCenter
                  }
                } catch (error) {
                  console.error('Error loading cluster assets:', error)
                }
              }

              return {
                initialCenter: center,
                initialZoom: zoom,
                initialAssets: assets,
                initialClusters: clusters,
                selectedAsset,
                selectedAssetAttributes,
                selectedCluster,
                clusterAssets,
                clusterTotalCount
              }
            },
            shouldRevalidate: () => false,
            handle: {
              crumb: "Map",
              hideBreadcrumbs: true
            },
          },
          {
            path: "library",
            handle: {
              crumb: "Library"
            },
            children: [
              {
                index: true,
                element: <LibraryPage />,
                loader: async ({ params }) => {
                  const { fetchFileTree } = await import('./api/assets')
                  return fetchFileTree(params.workspaceId!)
                },
              },
              {
                path: ":directoryId",
                element: <LibraryPage />,
                loader: async ({ params }) => {
                  const { fetchFileTree } = await import('./api/assets')
                  return fetchFileTree(params.workspaceId!, params.directoryId)
                },
              },
            ],
          },
          {
            path: "asset-types",
            handle: {
              crumb: "Asset Types"
            },
            children: [
              {
                index: true,
                element: <AssetTypesPage />,
                loader: async ({ params }) => {
                  const { fetchAssetTypes } = await import('./api/assets')
                  const data = await fetchAssetTypes(params.workspaceId!)
                  return Array.isArray(data) ? data : data.results || []
                },
              },
              {
                path: ":assetTypeId",
                loader: async ({ params }) => {
                  const { fetchAssetType } = await import('./api/assets')
                  return fetchAssetType(params.workspaceId!, params.assetTypeId!)
                },
                shouldRevalidate: ({ currentParams, nextParams }) => {
                  // Only reload if we're changing to a different asset type
                  return currentParams.assetTypeId !== nextParams.assetTypeId
                },
                handle: {
                  crumb: (data: any) => data?.loaderData?.name || 'Asset Type'
                },
                element: <AssetTypeLayout />,
                children: [
                  {
                    index: true,
                    element: <Navigate to="about" />,
                  },
                  {
                    path: "about",
                    element: <AssetTypeAboutPage />,
                    handle: {
                      crumb: "About"
                    }
                  },
                  {
                    path: "attributes",
                    element: <AssetTypeAttributesPage />,
                    handle: {
                      crumb: "Attributes"
                    },
                    loader: async ({ params, request }) => {
                      const url = new URL(request.url)
                      const search = url.searchParams.get('search') || undefined
                      const includeHidden = url.searchParams.get('include_hidden') === 'true'

                      const { fetchAssetAttributeDefinitions } = await import('./api/assets')
                      const response = await fetchAssetAttributeDefinitions(params.workspaceId!, params.assetTypeId!, 1, 25, { search, includeHidden })
                      const attributes = response.results || []
                      const count = response.count || 0

                      return { initialData: attributes, initialNextUrl: response.next, count, assetTypeId: params.assetTypeId, workspaceId: params.workspaceId, includeHidden };
                    },
                    shouldRevalidate: ({ currentUrl, nextUrl }) => {
                      // Revalidate if search or include_hidden param changes
                      return currentUrl.searchParams.get('search') !== nextUrl.searchParams.get('search') ||
                        currentUrl.searchParams.get('include_hidden') !== nextUrl.searchParams.get('include_hidden')
                    },
                  },
                  {
                    path: 'assets',
                    handle: {
                      crumb: "Assets"
                    },
                    children: [
                      {
                        index: true,
                        element: <AssetGridPage />,
                        loader: async ({ params }) => {
                          const { fetchAssetsByType, fetchAllAssetAttributeDefinitions } = await import('./api/assets')

                          const PAGE_SIZE = 20
                          // Fetch first page using limit/offset pagination
                          const response = await fetchAssetsByType(params.workspaceId!, params.assetTypeId!, PAGE_SIZE, 0)
                          const assets = response.results || []

                          // Fetch ALL asset type attributes (not paginated) to show all columns
                          const attributes = await fetchAllAssetAttributeDefinitions(params.workspaceId!, params.assetTypeId!)

                          return {
                            assets,
                            attributes,
                            totalCount: response.count,
                            pageSize: PAGE_SIZE,
                            workspaceId: params.workspaceId
                          };
                        },
                        // Don't revalidate when clicking the same tab (prevents losing unsaved changes)
                        shouldRevalidate: ({ currentUrl, nextUrl }) => {
                          return currentUrl.pathname !== nextUrl.pathname
                        },
                      },
                      {
                        path: ":assetId",
                        element: <AssetDetailPage />,
                        handle: {
                          crumb: ({ loaderData, crumb }) => loaderData?.asset?.name || crumb?.assetName || 'Asset Detail',
                          hideNavbar: true,
                        },
                        loader: async ({ params }) => {
                          const { fetchAsset, fetchAllAssetAttributeDefinitions } = await import('./api/assets')
                          const [asset, attributes] = await Promise.all([
                            fetchAsset(params.workspaceId!, params.assetId!),
                            fetchAllAssetAttributeDefinitions(params.workspaceId!, params.assetTypeId!)
                          ])
                          return { asset, attributes }
                        },
                      }
                    ]
                  },
                ]
              }
            ]
          },
          {
            path: "settings",
            element: <WorkspaceSettingsPage />,
            handle: {
              crumb: "Settings"
            },
          },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <OrganizationProvider>
        <SidebarProvider>
          <ChoicesProvider>
            <RouterProvider router={router} />
          </ChoicesProvider>
        </SidebarProvider>
      </OrganizationProvider>
    </ThemeProvider>
  </StrictMode>,
)
