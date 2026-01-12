import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider, type Params } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'
import App from './App.tsx'

// Lazy load route components
const WorkspacesPage = lazy(() => import('./pages/WorkspacesPage.tsx'))
const WorkspaceLayout = lazy(() => import('./pages/WorkspaceLayout.tsx'))
const WorkspaceSettingsPage = lazy(() => import('./pages/WorkspaceSettingsPage.tsx'))
const AssetTypesPage = lazy(() => import('./pages/AssetTypesPage.tsx'))
const MapPage = lazy(() => import('./pages/MapPage.tsx'))
const AssetListPage = lazy(() => import('./pages/AssetListPage.tsx'))
const AssetDetailPage = lazy(() => import('./pages/AssetDetailPage.tsx'))
const AssetTypeLayout = lazy(() => import('./pages/AssetTypeLayout.tsx'))
const AssetTypeAboutPage = lazy(() => import('./pages/AssetTypeAboutPage.tsx'))
const AssetTypeAttributesPage = lazy(() => import('./pages/AssetTypeAttributesPage.tsx'))

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
        element: <WorkspacesPage />,
        loader: async () => {
          const { fetchWorkspaces } = await import('./api/assets')
          const response = await fetchWorkspaces()
          return Array.isArray(response) ? response : response.results || []
        },
        handle: {
          crumb: "Workspaces"
        },
      },
      {
        path: "workspaces/:workspaceId",
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
              crumb: "Map"
            },
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

                      const { fetchAssetAttributeDefinitions } = await import('./api/assets')
                      const response = await fetchAssetAttributeDefinitions(params.workspaceId!, params.assetTypeId!, 1, 25, search)
                      const attributes = response.results || []
                      const count = response.count || 0

                      return { initialData: attributes, initialNextUrl: response.next, count, assetTypeId: params.assetTypeId, workspaceId: params.workspaceId };
                    },
                    shouldRevalidate: ({ currentUrl, nextUrl }) => {
                      // Only revalidate if search param changes
                      return currentUrl.searchParams.get('search') !== nextUrl.searchParams.get('search')
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
                        loader: async ({ params, request }) => {
                          const url = new URL(request.url)
                          const page = parseInt(url.searchParams.get('page') || '1')
                          const pageSize = parseInt(url.searchParams.get('pageSize') || '25')

                          const { fetchAssetsByType, fetchAllAssetAttributeDefinitions } = await import('./api/assets')

                          // Fetch paginated assets
                          const response = await fetchAssetsByType(params.workspaceId!, params.assetTypeId!, page, pageSize)
                          const assets = response.results || []
                          const count = response.count || 0

                          // Fetch ALL asset type attributes (not paginated) to show all columns
                          const attributes = await fetchAllAssetAttributeDefinitions(params.workspaceId!, params.assetTypeId!)

                          return { assets, attributes, count, page, pageSize, workspaceId: params.workspaceId };
                        },
                      },
                      {
                        path: ":assetId",
                        element: <AssetDetailPage />,
                        handle: {
                          crumb: ({ loaderData }) => loaderData?.name || 'Asset Detail',
                          hideNavbar: true,
                        },
                        loader: async ({ params }) => {
                          const { fetchAsset } = await import('./api/assets')
                          return fetchAsset(params.workspaceId!, params.assetId!)
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
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
