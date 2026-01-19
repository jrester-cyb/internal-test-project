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
const UserProfilePage = lazy(() => import('./pages/UserProfilePage.tsx'))
const SecuritySettingsPage = lazy(() => import('./pages/SecuritySettingsPage.tsx'))
const SessionsPage = lazy(() => import('./pages/security/SessionsPage.tsx'))
const MFADevicesPage = lazy(() => import('./pages/security/MFADevicesPage.tsx'))
const PasswordPage = lazy(() => import('./pages/security/PasswordPage.tsx'))
const RolesPage = lazy(() => import('./pages/admin/RolesPage.tsx'))
const RolesList = lazy(() => import('./pages/admin/RolesList.tsx'))
const SettingsLayout = lazy(() => import('./pages/settings/SettingsLayout.tsx'))
const SettingsIndexPage = lazy(() => import('./pages/settings/SettingsIndexPage.tsx'))
const UsersPage = lazy(() => import('./pages/admin/UsersPage.tsx'))
const GroupsPage = lazy(() => import('./pages/admin/GroupsPage.tsx'))
const AdminOrganizationsPage = lazy(() => import('./pages/admin/OrganizationsPage.tsx'))
const OrganizationManagePage = lazy(() => import('./pages/OrganizationManagePage.tsx'))

// Helper to create a lazy loader that caches the imported function after first load
// First call: async import -> cache -> call loader
// Subsequent calls: use cached loader directly (no async overhead)
// Returns both the loader and a preload function to warm up the cache
function createCachedLazyLoader<T extends (...args: any[]) => any>(
  importFn: () => Promise<T>
): {
  loader: (...args: Parameters<T>) => ReturnType<T> | Promise<Awaited<ReturnType<T>>>
  preload: () => Promise<void>
} {
  let cachedLoader: T | null = null
  let importPromise: Promise<T> | null = null

  const ensureImported = (): Promise<T> => {
    if (cachedLoader) {
      return Promise.resolve(cachedLoader)
    }
    if (!importPromise) {
      importPromise = importFn().then((loader) => {
        cachedLoader = loader
        return loader
      })
    }
    return importPromise
  }

  return {
    loader: (...args: Parameters<T>) => {
      if (cachedLoader) {
        return cachedLoader(...args)
      }
      return ensureImported().then((loader) => loader(...args))
    },
    preload: () => ensureImported().then(() => { }),
  }
}

// Lazy loader wrappers - dynamically import loader modules only when needed
// After first load, subsequent calls use the cached loader synchronously
// Each exports { loader, preload } - use .loader for routes, .preload for prefetching
const organizationsLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/organizations').then((m) => m.organizationsLoader)
)

const workspacesLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/workspaces').then((m) => m.workspacesLoader)
)

const organizationIndexLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/workspaces').then((m) => m.organizationIndexLoader)
)

const mapLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/map').then((m) => m.initialMapLoader)
)

const libraryLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/library').then((m) => m.libraryLoader)
)

const assetTypesLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/assetTypes').then((m) => m.assetTypesRouteLoader)
)

const assetTypeDetailLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/assetTypes').then((m) => m.assetTypeDetailRouteLoader)
)

const assetGridLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/assetTypes').then((m) => m.assetGridRouteLoader)
)

const assetAttributesLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/assetTypes').then((m) => m.assetAttributesRouteLoader)
)

const assetDetailLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/assetTypes').then((m) => m.assetDetailRouteLoader)
)

// Security loaders
const securityLayoutLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/security').then((m) => m.securityLayoutLoader)
)

const sessionsLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/security').then((m) => m.sessionsLoader)
)

const mfaDevicesLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/security').then((m) => m.mfaDevicesLoader)
)

const passwordLoaderBundle = createCachedLazyLoader(
  () => import('./loaders/security').then((m) => m.passwordLoader)
)

// Export preload functions for use in prefetch handlers
export const preloadMapLoader = mapLoaderBundle.preload
export const preloadAssetTypesLoader = assetTypesLoaderBundle.preload
export const preloadLibraryLoader = libraryLoaderBundle.preload
export const preloadAssetTypeDetailLoader = assetTypeDetailLoaderBundle.preload
export const preloadAssetGridLoader = assetGridLoaderBundle.preload
export const preloadAssetAttributesLoader = assetAttributesLoaderBundle.preload
export const preloadAssetDetailLoader = assetDetailLoaderBundle.preload

// Security page preload functions
export const preloadSessionsLoader = sessionsLoaderBundle.preload
export const preloadMfaDevicesLoader = mfaDevicesLoaderBundle.preload
export const preloadPasswordLoader = passwordLoaderBundle.preload

// Shared profile child routes (used by /profile and /settings/users/:userId)
const profileChildRoutes = [
  {
    index: true,
    element: <UserProfilePage />,
  },
  {
    path: "security",
    element: <SecuritySettingsPage />,
    loader: securityLayoutLoaderBundle.loader,
    handle: {
      crumb: "Security",
    },
    children: [
      {
        index: true,
        element: <Navigate to="sessions" replace />,
      },
      {
        path: "sessions",
        element: <SessionsPage />,
        loader: sessionsLoaderBundle.loader,
      },
      {
        path: "mfa",
        element: <MFADevicesPage />,
        loader: mfaDevicesLoaderBundle.loader,
      },
      {
        path: "password",
        element: <PasswordPage />,
        loader: passwordLoaderBundle.loader,
      },
    ],
  },
]

// Routes shared between org-level and workspace-level
const sharedRoutes = [
  {
    loader: mapLoaderBundle.loader,
    shouldRevalidate: ({ currentParams, nextParams, nextUrl, currentUrl }: any) => {
      // Never revalidate for search param changes only (lat/lng/zoom updates)
      if (currentUrl.pathname === nextUrl.pathname &&
          currentParams.organizationId === nextParams.organizationId &&
          currentParams.workspaceId === nextParams.workspaceId) {
        return false
      }

      // Only revalidate if we're actually navigating TO a map route
      const isNavigatingToMap = nextUrl.pathname.endsWith('/map') || nextUrl.pathname.includes('/map?')
      if (!isNavigatingToMap) {
        return false
      }

      // Revalidate when organization or workspace changes
      return currentParams.organizationId !== nextParams.organizationId ||
        currentParams.workspaceId !== nextParams.workspaceId
    },
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
        loader: assetTypesLoaderBundle.loader,
      },
      {
        path: ":assetTypeId",
        loader: assetTypeDetailLoaderBundle.loader,
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
            loader: assetAttributesLoaderBundle.loader,
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
                loader: assetGridLoaderBundle.loader,
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
                loader: assetDetailLoaderBundle.loader,
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
        loader: libraryLoaderBundle.loader,
      },
      {
        path: ":directoryId",
        element: <LibraryPage />,
        loader: libraryLoaderBundle.loader,
      },
    ],
  },
]

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    loader: organizationsLoaderBundle.loader,
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
        path: "profile",
        handle: {
          crumb: "Profile",
          hideSidebar: true,
        },
        children: profileChildRoutes,
      },
      {
        path: "settings",
        element: <SettingsLayout />,
        handle: {
          crumb: "Settings",
          hideSidebar: true,
        },
        children: [
          {
            index: true,
            element: <SettingsIndexPage />,
          },
          {
            path: "roles",
            element: <RolesPage />,
            handle: {
              crumb: "Roles",
            },
            children: [
              {
                index: true,
                element: <Navigate to="instance" replace />,
              },
              {
                path: ":scope",
                element: <RolesList />,
              },
            ],
          },
          {
            path: "users",
            handle: {
              crumb: "Users",
            },
            children: [
              {
                index: true,
                element: <UsersPage />,
              },
              {
                path: ":userId",
                handle: {
                  crumb: "User Details",
                },
                children: profileChildRoutes,
              },
            ],
          },
          {
            path: "groups",
            element: <GroupsPage />,
            handle: {
              crumb: "Groups",
            },
          },
          {
            path: "organizations",
            handle: {
              crumb: "Organizations",
            },
            children: [
              {
                index: true,
                element: <AdminOrganizationsPage />,
              },
              {
                path: ":organizationId",
                children: [
                  // Organization management (members & workspaces)
                  {
                    path: "manage",
                    element: <OrganizationManagePage />,
                    handle: {
                      crumb: "Manage",
                    },
                  },
                ]
              }
            ]
          },
        ],
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
            loader: workspacesLoaderBundle.loader,
            shouldRevalidate: ({ currentParams, nextParams }) => {
              // Revalidate when organization changes
              return currentParams.organizationId !== nextParams.organizationId
            },
            element: <OrganizationLayout />,
            children: [
              {
                index: true,
                loader: organizationIndexLoaderBundle.loader,
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
