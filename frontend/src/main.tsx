import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider, type Params } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { OrganizationProvider } from './contexts/OrganizationContext'
import { SidebarProvider } from './contexts/SidebarContext'
import './index.css'
import App from './App.tsx'

// Lazy load route components
const OrganizationsPage = lazy(() => import('./pages/OrganizationsPage.tsx'))
const OrganizationLandingPage = lazy(() => import('./pages/OrganizationLandingPage.tsx'))
const OrganizationSettingsPage = lazy(() => import('./pages/OrganizationSettingsPage.tsx'))
const ManageWorkspacesPage = lazy(() => import('./pages/ManageWorkspacesPage.tsx'))
const WorkspaceLayout = lazy(() => import('./pages/WorkspaceLayout.tsx'))
const WorkspaceSettingsPage = lazy(() => import('./pages/WorkspaceSettingsPage.tsx'))
const AssetTypesPage = lazy(() => import('./pages/AssetTypesPage.tsx'))
const MapPage = lazy(() => import('./pages/MapPage.tsx'))
const AssetListPage = lazy(() => import('./pages/AssetListPage.tsx'))
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
                        element: <AssetListPage />,
                        loader: async ({ params }) => {
                          const { fetchAssetsByType, fetchAllAssetAttributeDefinitions } = await import('./api/assets')

                          // Fetch first page using cursor pagination (faster - no COUNT query)
                          const response = await fetchAssetsByType(params.workspaceId!, params.assetTypeId!, null, 50)
                          const assets = response.results || []

                          // Fetch ALL asset type attributes (not paginated) to show all columns
                          const attributes = await fetchAllAssetAttributeDefinitions(params.workspaceId!, params.assetTypeId!)

                          return { assets, attributes, nextCursor: response.next, workspaceId: params.workspaceId };
                        },
                      },
                      {
                        path: ":assetId",
                        element: <AssetDetailPage />,
                        handle: {
                          crumb: ({ loaderData }) => loaderData?.asset?.name || 'Asset Detail',
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
          <RouterProvider router={router} />
        </SidebarProvider>
      </OrganizationProvider>
    </ThemeProvider>
  </StrictMode>,
)
