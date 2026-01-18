import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy } from 'react'
import { organizationsLoader } from './loaders/organizations'
import { workspacesLoader } from './loaders/workspaces'
import { initialMapLoader } from './loaders/map'
import { libraryLoader } from './loaders/library'
import { assetTypeDetailRouteLoader, assetTypesRouteLoader } from './loaders/assetTypes'

// Lazy load layout and route components
const MainLayout = lazy(() => import('./components/MainLayout.tsx'))
const OrganizationsPage = lazy(() => import('./pages/OrganizationsPage.tsx'))
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
const OrganizationIndexPage = lazy(() => import('./pages/OrganizationIndexPage.tsx'))
const OrganizationLayout = lazy(() => import('./pages/OrganizationLayout.tsx'))
const LandingPage = lazy(() => import('./pages/LandingPage.tsx'))

// Routes shared between org-level and workspace-level
const sharedRoutes = [
  {
    loader: initialMapLoader,
    shouldRevalidate: () => false,
    path: "map",
    element: <MapPage />,
  },
  {
    path: "asset-types",
    handle: {
      crumb: "Asset Types",
    },
    children: [
      {
        index: true,
        element: <AssetTypesPage />,
        loader: assetTypesRouteLoader,
      },
      {
        path: ":assetTypeId",
        loader: assetTypeDetailRouteLoader,
        shouldRevalidate: ({ currentParams, nextParams }) => {
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
              const response = await fetchAssetAttributeDefinitions(params.organizationId!, params.workspaceId!, params.assetTypeId!, 1, 25, { search, includeHidden })
              const attributes = response.results || []
              const count = response.count || 0

              return { initialData: attributes, initialNextUrl: response.next, count, assetTypeId: params.assetTypeId, workspaceId: params.workspaceId, organizationId: params.organizationId, includeHidden };
            },
            shouldRevalidate: ({ currentUrl, nextUrl }) => {
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
                  const response = await fetchAssetsByType(params.organizationId!, params.workspaceId!, params.assetTypeId!, PAGE_SIZE, 0)
                  const assets = response.results || []

                  const attributes = await fetchAllAssetAttributeDefinitions(params.organizationId!, params.workspaceId!, params.assetTypeId!)

                  return {
                    assets,
                    attributes,
                    totalCount: response.count,
                    pageSize: PAGE_SIZE,
                    workspaceId: params.workspaceId,
                    organizationId: params.organizationId
                  };
                },
                shouldRevalidate: ({ currentUrl, nextUrl }) => {
                  return currentUrl.pathname !== nextUrl.pathname
                },
              },
              {
                path: ":assetId",
                element: <AssetDetailPage />,
                handle: {
                  crumb: ({ loaderData, crumb }: any) => loaderData?.asset?.name || crumb?.assetName || 'Asset Detail',
                  hideNavbar: true,
                },
                loader: async ({ params }) => {
                  const { fetchAsset, fetchAllAssetAttributeDefinitions } = await import('./api/assets')
                  const [asset, attributes] = await Promise.all([
                    fetchAsset(params.organizationId!, params.workspaceId!, params.assetId!),
                    fetchAllAssetAttributeDefinitions(params.organizationId!, params.workspaceId!, params.assetTypeId!)
                  ])
                  return { asset, attributes, organizationId: params.organizationId, workspaceId: params.workspaceId }
                },
              }
            ]
          },
        ]
      }
    ]
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
        loader: libraryLoader,
      },
      {
        path: ":directoryId",
        element: <LibraryPage />,
        loader: libraryLoader,
      },
    ],
  },
]

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    loader: organizationsLoader,
    shouldRevalidate: () => false,
    children: [
      {
        index: true,
        element: <LandingPage />,
        handle: {
          hideSidebar: true
        },
      },
      {
        path: "organizations",
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
            path: ":organizationId",
            id: "organization",
            loader: workspacesLoader,
            shouldRevalidate: () => false,
            element: <OrganizationLayout />,
            children: [
              {
                index: true,
                element: <OrganizationIndexPage />,
              },
              // Org-level routes
              ...sharedRoutes,

              // Workspace-level routes
              {
                path: "workspaces",
                children: [
                  {
                    index: true,
                    element: <ManageWorkspacesPage />,
                    handle: {
                      crumb: "Workspaces",
                    },
                  },
                  {
                    path: ":workspaceId",
                    element: <WorkspaceLayout />,
                    children: [
                      {
                        index: true,
                        element: <Navigate to="map" replace />,
                      },
                      ...sharedRoutes,
                      {
                        path: "settings",
                        element: <WorkspaceSettingsPage />,
                        handle: {
                          crumb: "Settings",
                        },
                      },
                    ],
                  }
                ],
              },
            ],
          },
        ]
      },

    ]
  },
])
