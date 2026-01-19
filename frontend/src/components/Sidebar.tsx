import { useCallback } from 'react'
import { Box, List, Drawer, IconButton, Typography, Divider, useTheme } from '@mui/material'
import { Map as MapIcon, Inventory as AssetsIcon, Menu as MenuIcon, ChevronLeft as ChevronLeftIcon, FolderCopy as LibraryIcon, Settings as SettingsIcon } from '@mui/icons-material'
import SidebarNavItem from '@app/components/SidebarNavItem'
import { useLayout } from '@app/contexts/LayoutContext'
import { useOrganization } from '@app/contexts/OrganizationContext'
import { useUser } from '@app/contexts/UserContext'
import { prefetchMap, prefetchAssetTypes, prefetchLibrary } from '@app/utils/preload'
import { buildMapUrlWithPosition } from '@app/utils/mapPosition'

export default function Sidebar() {
  const theme = useTheme()
  const { sidebarOpen, setSidebarOpen, isMobile, hideSidebar } = useLayout()
  const { activeOrganization, activeWorkspace, isGlobalMode } = useOrganization()
  const { hasInstancePermission, hasOrganizationPermission, hasWorkspacePermission } = useUser()

  // Show settings if user can manage at any level
  const canManageInstance = hasInstancePermission('instance:manage')
  const canManageOrganization = activeOrganization && hasOrganizationPermission(activeOrganization.id, 'organization:manage')
  const canManageWorkspace = activeWorkspace && hasWorkspacePermission(activeWorkspace.id, 'workspace:manage')
  const showSettings = canManageInstance || canManageOrganization || canManageWorkspace

  if (hideSidebar || isMobile) {
    return null
  }

  const variant = isMobile ? 'temporary' : 'persistent'
  const drawerWidth = variant === 'temporary' ? 240 : (sidebarOpen ? 240 : 64)

  // Build paths based on global mode or workspace mode
  const basePath = isGlobalMode
    ? `/organizations/${activeOrganization.id}`
    : `/organizations/${activeOrganization.id}/workspaces/${activeWorkspace?.id}`

  const modeLabel = isGlobalMode ? 'GLOBAL' : 'WORKSPACE'

  // Prefetch handlers that pass the current org/workspace context
  const handlePrefetchMap = useCallback(() => {
    prefetchMap(activeOrganization.id, activeWorkspace?.id)
  }, [activeOrganization.id, activeWorkspace?.id])

  const handlePrefetchAssetTypes = useCallback(() => {
    prefetchAssetTypes(activeOrganization.id, activeWorkspace?.id)
  }, [activeOrganization.id, activeWorkspace?.id])

  const handlePrefetchLibrary = useCallback(() => {
    prefetchLibrary(activeOrganization.id, activeWorkspace?.id)
  }, [activeOrganization.id, activeWorkspace?.id])

  // Build map URL with saved position - reads from localStorage on each render
  // This is fine since Sidebar re-renders when navigating away from the map
  const mapUrl = buildMapUrlWithPosition(basePath, activeOrganization.id, activeWorkspace?.id)

  return (
    <Drawer
      variant={variant}
      elevation={0}
      anchor={variant === 'temporary' ? 'left' : undefined}
      open={true}
      onClose={() => setSidebarOpen(false)}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        zIndex: theme.zIndex.appBar - 1,
        transition: 'width 225ms cubic-bezier(0.4, 0, 0.6, 1)',
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          transition: 'width 225ms cubic-bezier(0.4, 0, 0.6, 1)',
          overflowX: 'hidden',
          zIndex: theme.zIndex.appBar - 1,
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', mt: 8 }}>
        {/* Top section with main navigation */}
        <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
          {variant !== 'temporary' && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
              <IconButton
                onClick={() => setSidebarOpen(!sidebarOpen)}
                sx={{ color: 'inherit' }}
              >
                {sidebarOpen ? <ChevronLeftIcon /> : <MenuIcon />}
              </IconButton>
            </Box>
          )}
          <List>
            {(isMobile || sidebarOpen) && (
              <Typography variant="caption" sx={{ px: 2, py: 1, opacity: 0.7, display: 'block' }}>
                {modeLabel}
              </Typography>
            )}
            <SidebarNavItem
              to={mapUrl}
              icon={<MapIcon />}
              label="Map"
              onPreload={handlePrefetchMap}
            />
            <SidebarNavItem
              to={`${basePath}/asset-types`}
              icon={<AssetsIcon />}
              label="Assets"
              onPreload={handlePrefetchAssetTypes}
            />
            <SidebarNavItem
              to={`${basePath}/library`}
              icon={<LibraryIcon />}
              label="Library"
              onPreload={handlePrefetchLibrary}
            />
          </List>
        </Box>

        {/* Bottom section with Settings */}
        {showSettings && (
          <Box sx={{ pb: 2 }}>
            <Divider sx={{ borderColor: 'currentColor', opacity: 0.2, mb: 1 }} />
            <List disablePadding>
              <SidebarNavItem
                to="/settings"
                icon={<SettingsIcon />}
                label="Settings"
              />
            </List>
          </Box>
        )}
      </Box>
    </Drawer>
  )
}
