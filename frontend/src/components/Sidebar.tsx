import { Box, List, Drawer, IconButton, Divider, Typography } from '@mui/material'
import { Map as MapIcon, Inventory as AssetsIcon, Menu as MenuIcon, ChevronLeft as ChevronLeftIcon, Settings, FolderCopy as LibraryIcon, Business as BusinessIcon, Folder as FolderIcon } from '@mui/icons-material'
import { useParams } from 'react-router-dom'
import SidebarNavItem from '@app/components/SidebarNavItem'
import { useSidebar } from '@app/contexts/SidebarContext'

interface SidebarProps {
  isOpen: boolean
  onToggle: (open: boolean) => void
  variant?: 'permanent' | 'temporary'
  onClose?: () => void
}

export default function Sidebar({ isOpen, onToggle, variant = 'permanent', onClose }: SidebarProps) {
  const { isMobile } = useSidebar()
  const { organizationId, workspaceId } = useParams()
  const drawerWidth = variant === 'temporary' ? 240 : (isOpen ? 240 : 64)

  // Build paths
  const workspacePath = organizationId && workspaceId ? `/organizations/${organizationId}/workspaces/${workspaceId}` : ''
  const orgPath = organizationId ? `/organizations/${organizationId}` : ''

  return (
    <>
      <Drawer
        variant={variant}
        elevation={0}
        anchor={variant === 'temporary' ? 'left' : undefined}
        open={isOpen}
        onClose={onClose}
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          zIndex: (theme) => theme.zIndex.appBar - 1,
          transition: 'width 225ms cubic-bezier(0.4, 0, 0.6, 1)',
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            backgroundColor: 'primary.main',
            color: '#ffffff',
            transition: 'width 225ms cubic-bezier(0.4, 0, 0.6, 1)',
            overflowX: 'hidden',
            zIndex: (theme) => theme.zIndex.appBar - 1,
          },
        }}
      >
        <Box sx={{ overflow: 'auto', mt: 8 }}>
          {variant !== 'temporary' && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
              <IconButton
                onClick={() => onToggle(!isOpen)}
                sx={{ color: 'white' }}
              >
                {isOpen ? <ChevronLeftIcon /> : <MenuIcon />}
              </IconButton>
            </Box>
          )}
          <List>
            {organizationId && !workspaceId && (
              <>
                {(isMobile || isOpen) && (
                  <Typography variant="caption" sx={{ px: 2, py: 1, color: 'rgba(255,255,255,0.7)', display: 'block' }}>
                    ORGANIZATION
                  </Typography>
                )}
                <SidebarNavItem
                  to={`${orgPath}/map`}
                  icon={<MapIcon />}
                  label="Map"
                />
                <SidebarNavItem
                  to={`${orgPath}/asset-types`}
                  icon={<AssetsIcon />}
                  label="Assets"
                />
                <SidebarNavItem
                  to={`${orgPath}/library`}
                  icon={<LibraryIcon />}
                  label="Library"
                />
              </>
            )}
            {workspaceId && (
              <>
                {(isMobile || isOpen) && (
                  <Typography variant="caption" sx={{ px: 2, py: 1, color: 'rgba(255,255,255,0.7)', display: 'block' }}>
                    WORKSPACE
                  </Typography>
                )}
                <SidebarNavItem
                  to={`${workspacePath}/map`}
                  icon={<MapIcon />}
                  label="Map"
                />
                <SidebarNavItem
                  to={`${workspacePath}/asset-types`}
                  icon={<AssetsIcon />}
                  label="Assets"
                />
                <SidebarNavItem
                  to={`${workspacePath}/library`}
                  icon={<LibraryIcon />}
                  label="Library"
                />
              </>
            )}
          </List>
        </Box>
      </Drawer>
    </>
  )
}
