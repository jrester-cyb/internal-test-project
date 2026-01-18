import { Suspense } from 'react'
import { Outlet, useLoaderData, useNavigation, useLocation } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import { OrganizationProvider } from '@app/contexts/OrganizationContext'
import { LayoutProvider, useLayout } from '@app/contexts/LayoutContext'
import PvAppBar from '@app/components/PvAppBar'
import Sidebar from '@app/components/Sidebar'
import { AssetTypesPageSkeleton, LibraryPageSkeleton, MapPageSkeleton, GenericPageSkeleton } from '@app/components/PageSkeletons'
import type { Organization } from '@app/types'
import AppBreadcrumbs from './AppBreadcrumbs'

/**
 * Returns the appropriate skeleton component based on the navigation target path
 */
function getSkeletonForPath(path: string): React.ReactNode {
  // Check which page we're navigating to
  if (path.includes('/asset-types') && !path.match(/\/asset-types\/[^/]+/)) {
    // Asset types list page (not a specific asset type)
    return <AssetTypesPageSkeleton />
  }
  if (path.includes('/library')) {
    return <LibraryPageSkeleton />
  }
  if (path.includes('/map')) {
    return <MapPageSkeleton />
  }
  // Default fallback
  return <GenericPageSkeleton />
}

function MainLayoutContent() {
  const { sidebarOpen, isMobile, hideSidebar } = useLayout()
  const navigation = useNavigation()
  const location = useLocation()

  // Calculate sidebar width for main content offset
  const sidebarWidth = hideSidebar ? 0 : (isMobile ? 0 : (sidebarOpen ? 240 : 64))

  // Check if we're navigating to a different page (loading state)
  const isNavigating = navigation.state === 'loading'
  const targetPath = navigation.location?.pathname

  // Determine if we're navigating to a different main section (sidebar pages)
  const isNavigatingToNewSection = isNavigating && targetPath && (
    // Check if navigating from one main section to another
    (location.pathname.includes('/map') && !targetPath.includes('/map')) ||
    (location.pathname.includes('/library') && !targetPath.includes('/library')) ||
    (location.pathname.includes('/asset-types') && !targetPath.includes('/asset-types')) ||
    // Or navigating to a main section from elsewhere
    (!location.pathname.includes('/map') && targetPath.includes('/map')) ||
    (!location.pathname.includes('/library') && targetPath.includes('/library')) ||
    (!location.pathname.includes('/asset-types') && targetPath.includes('/asset-types'))
  )

  return (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <PvAppBar />
      <Sidebar />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          mt: 8, // Offset for AppBar height
          ml: `${sidebarWidth}px`,
          transition: 'margin-left 225ms cubic-bezier(0.4, 0, 0.6, 1)',
        }}
      >
        {/* Hide breadcrumbs when navigating to map (which has no breadcrumbs) */}
        {!(isNavigating && targetPath?.includes('/map')) && (
          <Box sx={{ px: 3, pt: 2 }}>
            <AppBreadcrumbs />
          </Box>
        )}
        {/* Show skeleton when navigating between main sections */}
        {isNavigatingToNewSection && targetPath ? (
          getSkeletonForPath(targetPath)
        ) : (
          <Suspense fallback={
            <Box display="flex" justifyContent="center" alignItems="center" height="100%" width="100%">
              <CircularProgress />
            </Box>
          }>
            <Outlet />
          </Suspense>
        )}
      </Box>
    </Box>
  )
}

export default function MainLayout() {
  const { organizations } = useLoaderData() as { organizations: Organization[] }

  return (
    <OrganizationProvider organizations={organizations}>
      <LayoutProvider>
        <MainLayoutContent />
      </LayoutProvider>
    </OrganizationProvider>
  )
}
