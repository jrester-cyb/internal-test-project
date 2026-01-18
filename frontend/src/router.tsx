import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy } from 'react'

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

// Lazy loader wrappers - dynamically import loader modules only when needed
const lazyOrganizationsLoader = async () => {
  const { organizationsLoader } = await import('./loaders/organizations')
  return organizationsLoader()
}

const lazyWorkspacesLoader = async (args: any) => {
  const { workspacesLoader } = await import('./loaders/workspaces')
  return workspacesLoader(args)
}

const lazyMapLoader = async (args: any) => {
  const { initialMapLoader } = await import('./loaders/map')
  return initialMapLoader(args)
}

const lazyLibraryLoader = async (args: any) => {
  const { libraryLoader } = await import('./loaders/library')
  return libraryLoader(args)
}

const lazyAssetTypesLoader = async (args: any) => {
  const { assetTypesRouteLoader } = await import('./loaders/assetTypes')
  return assetTypesRouteLoader(args)
}

const lazyAssetTypeDetailLoader = async (args: any) => {
  const { assetTypeDetailRouteLoader } = await import('./loaders/assetTypes')
  return assetTypeDetailRouteLoader(args)
}

const lazyAssetGridLoader = async (args: any) => {
  const { assetGridRouteLoader } = await import('./loaders/assetTypes')
  return assetGridRouteLoader(args)
}

const lazyAssetAttributesLoader = async (args: any) => {
  const { assetAttributesRouteLoader } = await import('./loaders/assetTypes')
  return assetAttributesRouteLoader(args)
}

const lazyAssetDetailLoader = async (args: any) => {
  const { assetDetailRouteLoader } = await import('./loaders/assetTypes')
  return assetDetailRouteLoader(args)
}

// Routes shared between org-level and workspace-level
const sharedRoutes = [
  {
    loader: lazyMapLoader,
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
        loader: lazyAssetTypesLoader,
      },
      {
        path: ":assetTypeId",
        loader: lazyAssetTypeDetailLoader,
        shouldRevalidate: ({ currentParams, nextParams }: any) => {
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
            loader: lazyAssetAttributesLoader,
            shouldRevalidate: ({ currentUrl, nextUrl }: any) => {
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
                loader: lazyAssetGridLoader,
                shouldRevalidate: ({ currentUrl, nextUrl }: any) => {
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
                loader: lazyAssetDetailLoader,
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
        loader: lazyLibraryLoader,
      },
      {
        path: ":directoryId",
        element: <LibraryPage />,
        loader: lazyLibraryLoader,
      },
    ],
  },
]

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    loader: lazyOrganizationsLoader,
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
            loader: lazyWorkspacesLoader,
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
