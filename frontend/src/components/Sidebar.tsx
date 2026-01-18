import { Box, List, Drawer, IconButton, Typography, useTheme } from '@mui/material'
import { Map as MapIcon, Inventory as AssetsIcon, Menu as MenuIcon, ChevronLeft as ChevronLeftIcon, FolderCopy as LibraryIcon } from '@mui/icons-material'
import SidebarNavItem from '@app/components/SidebarNavItem'
import { useLayout } from '@app/contexts/LayoutContext'
import { useOrganization } from '@app/contexts/OrganizationContext'
import { preloadMapPage, preloadAssetTypesPage, preloadLibraryPage } from '@app/utils/preload'

export default function Sidebar() {
  const theme = useTheme()
  const { sidebarOpen, setSidebarOpen, isMobile, hideSidebar } = useLayout()
  const { activeOrganization, activeWorkspace, isGlobalMode } = useOrganization()

  if (hideSidebar) {
    return null
  }

  const variant = isMobile ? 'temporary' : 'persistent'
  const drawerWidth = variant === 'temporary' ? 240 : (sidebarOpen ? 240 : 64)

  // Build paths based on global mode or workspace mode
  const basePath = isGlobalMode
    ? `/organizations/${activeOrganization.id}`
    : `/organizations/${activeOrganization.id}/workspaces/${activeWorkspace?.id}`

  const modeLabel = isGlobalMode ? 'GLOBAL' : 'WORKSPACE'

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
          color: '#ffffff',
          transition: 'width 225ms cubic-bezier(0.4, 0, 0.6, 1)',
          overflowX: 'hidden',
          zIndex: theme.zIndex.appBar - 1,
        },
      }}
    >
      <Box sx={{ overflow: 'auto', mt: 8 }}>
        {variant !== 'temporary' && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
            <IconButton
              onClick={() => setSidebarOpen(!sidebarOpen)}
              sx={{ color: 'white' }}
            >
              {sidebarOpen ? <ChevronLeftIcon /> : <MenuIcon />}
            </IconButton>
          </Box>
        )}
        <List>
          {(isMobile || sidebarOpen) && (
            <Typography variant="caption" sx={{ px: 2, py: 1, color: 'rgba(255,255,255,0.7)', display: 'block' }}>
              {modeLabel}
            </Typography>
          )}
          <SidebarNavItem
            to={`${basePath}/map`}
            icon={<MapIcon />}
            label="Map"
            onPreload={preloadMapPage}
          />
          <SidebarNavItem
            to={`${basePath}/asset-types`}
            icon={<AssetsIcon />}
            label="Assets"
            onPreload={preloadAssetTypesPage}
          />
          <SidebarNavItem
            to={`${basePath}/library`}
            icon={<LibraryIcon />}
            label="Library"
            onPreload={preloadLibraryPage}
          />
        </List>
      </Box>
    </Drawer>
  )
}
