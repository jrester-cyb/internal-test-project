import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy } from 'react'
import { organizationsLoader } from './loaders/organizations'
import { workspacesLoader } from './loaders/workspaces'
import { initialMapLoader } from './loaders/map'
import { libraryLoader } from './loaders/library'
import {
  assetTypeDetailRouteLoader,
  assetTypesRouteLoader,
  assetGridRouteLoader,
  assetAttributesRouteLoader,
  assetDetailRouteLoader,
} from './loaders/assetTypes'

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
            loader: assetAttributesRouteLoader,
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
                loader: assetGridRouteLoader,
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
                loader: assetDetailRouteLoader,
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
