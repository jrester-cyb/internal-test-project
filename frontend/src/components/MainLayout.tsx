import { Suspense } from 'react'
import { Outlet, useLoaderData, useNavigation, useLocation, useNavigate } from 'react-router-dom'
import { Box, CircularProgress, BottomNavigation, BottomNavigationAction } from '@mui/material'
import { Map as MapIcon, Inventory as AssetsIcon, FolderCopy as LibraryIcon } from '@mui/icons-material'
import { OrganizationProvider, useOrganization } from '@app/contexts/OrganizationContext'
import { LayoutProvider, useLayout } from '@app/contexts/LayoutContext'
import PvAppBar from '@app/components/PvAppBar'
import Sidebar from '@app/components/Sidebar'
import { AssetTypesPageSkeleton, LibraryPageSkeleton, MapPageSkeleton, GenericPageSkeleton } from '@app/components/PageSkeletons'
import { isMapPreloaded } from '@app/utils/preload'
import type { Organization } from '@app/types'
import AppBreadcrumbs from './AppBreadcrumbs'

/**
 * Returns the appropriate skeleton component based on the navigation target path
 * Returns null if the page has been preloaded (no skeleton needed)
 */
function getSkeletonForPath(path: string): React.ReactNode | null {
  // Check which page we're navigating to
  if (path.includes('/asset-types') && !path.match(/\/asset-types\/[^/]+/)) {
    // Asset types list page (not a specific asset type)
    return <AssetTypesPageSkeleton />
  }
  if (path.includes('/library')) {
    return <LibraryPageSkeleton />
  }
  if (path.includes('/map')) {
    // Skip skeleton if map has been preloaded
    if (isMapPreloaded()) {
      return null
    }
    return <MapPageSkeleton />
  }
  // Default fallback
  return <GenericPageSkeleton />
}

function MainLayoutContent() {
  const { sidebarOpen, isMobile, hideSidebar } = useLayout()
  const navigation = useNavigation()
  const location = useLocation()
  const navigate = useNavigate()
  const { activeOrganization, activeWorkspace, isGlobalMode } = useOrganization()

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

  // Calculate bottom nav value for mobile
  let bottomNavValue = -1
  if (location.pathname.includes('/map')) bottomNavValue = 0
  else if (location.pathname.includes('/asset-types')) bottomNavValue = 1
  else if (location.pathname.includes('/library')) bottomNavValue = 2

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
          pb: isMobile ? 7 : 0, // Offset for BottomNavigation height
          transition: 'margin-left 225ms cubic-bezier(0.4, 0, 0.6, 1)',
        }}
      >
        {/* Hide breadcrumbs when navigating to map (which has no breadcrumbs) */}
        {!(isNavigating && targetPath?.includes('/map')) && (
          <Box sx={{ px: 3, pt: 2 }}>
            <AppBreadcrumbs />
          </Box>
        )}
        {/* Show skeleton when navigating between main sections (unless preloaded) */}
        {isNavigatingToNewSection && targetPath && getSkeletonForPath(targetPath) ? (
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

        {/* Footer - hidden on mobile */}
        {!isMobile && (
          <Box
            component="footer"
            sx={{
              py: 0.5,
              px: 3,
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <Box
              component="span"
              sx={{
                fontSize: '0.75rem',
                color: 'text.secondary',
              }}
            >
              © {new Date().getFullYear()} Your Company
            </Box>
          </Box>
        )}
      </Box>

      {isMobile && (
        <BottomNavigation
          showLabels={true}
          value={bottomNavValue}
          onChange={(event, newValue) => {
            const basePath = isGlobalMode
              ? `/organizations/${activeOrganization.id}`
              : `/organizations/${activeOrganization.id}/workspaces/${activeWorkspace?.id}`
            const paths = [`${basePath}/map`, `${basePath}/asset-types`, `${basePath}/library`]
            navigate(paths[newValue])
          }}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            bgcolor: 'primary.main',
            '& .MuiBottomNavigationAction-root': {
              color: 'primary.contrastText',
            },
            '& .MuiBottomNavigationAction-root.Mui-selected': {
              color: 'secondary.main',
            },
            '& .MuiBottomNavigationAction-label': {
              fontSize: '0.875rem',
              transition: 'none',
            },
          }}
        >
          <BottomNavigationAction label="Map" icon={<MapIcon />} />
          <BottomNavigationAction label="Assets" icon={<AssetsIcon />} />
          <BottomNavigationAction label="Library" icon={<LibraryIcon />} />
        </BottomNavigation>
      )}
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
