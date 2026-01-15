import { Suspense, useState, useEffect } from 'react'
import { Outlet, useNavigation, useNavigate, useParams, useMatches } from 'react-router-dom'
import { AppBar, Toolbar, Box, Typography, CircularProgress, LinearProgress, Button, Drawer, IconButton, BottomNavigation, BottomNavigationAction } from '@mui/material'
import { Help as HelpIcon, Person as PersonIcon, AccountCircle as AccountCircleIcon, SwapHoriz as SwapHorizIcon, DarkMode as DarkModeIcon, LightMode as LightModeIcon, Logout as LogoutIcon, Business as BusinessIcon, Map as MapIcon, Inventory as AssetsIcon, FolderCopy as LibraryIcon } from '@mui/icons-material'
import Sidebar from './components/Sidebar'
import AppBreadcrumbs from './components/AppBreadcrumbs'
import ActionButtons from './components/ActionButtons'
import { fetchWorkspaces } from './api/assets'
import { useTheme } from './contexts/ThemeContext'
import { useOrganization } from './contexts/OrganizationContext'
import { useSidebar } from './contexts/SidebarContext'

interface Workspace {
  id: string
  name: string
  organization: string
}

function App() {
  const navigation = useNavigation()
  const navigate = useNavigate()
  const matches = useMatches()
  const { organizationId, workspaceId } = useParams()
  const { isDarkMode, toggleTheme } = useTheme()
  const { organizations, activeOrganization, setActiveOrganization } = useOrganization()
  const { isOpen, setIsOpen, isMobile, windowWidth } = useSidebar()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const isNavigating = Boolean(navigation.location);

  // Check if any matched route has hideBreadcrumbs or hideSidebar set to true
  const hideBreadcrumbs = matches.some((match) => (match.handle as any)?.hideBreadcrumbs)
  const hideSidebar = matches.some((match) => (match.handle as any)?.hideSidebar)

  const orgPath = organizationId ? `/organizations/${organizationId}` : ''
  const basePath = organizationId && workspaceId ? `${orgPath}/workspaces/${workspaceId}` : orgPath

  const getBottomNavValue = () => {
    const pathname = matches[matches.length - 1]?.pathname || ''
    if (pathname.includes('/map')) return 'map'
    if (pathname.includes('/asset-types')) return 'assets'
    if (pathname.includes('/library')) return 'library'
    return 'map'
  }

  const handleBottomNavChange = (event: React.SyntheticEvent, newValue: string) => {
    if (newValue === 'map') navigate(`${basePath}/map`)
    else if (newValue === 'assets') navigate(`${basePath}/asset-types`)
    else if (newValue === 'library') navigate(`${basePath}/library`)
  }

  // Load workspaces
  useEffect(() => {
    async function loadWorkspaces() {
      try {
        const data = await fetchWorkspaces()
        setWorkspaces(Array.isArray(data) ? data : data.results || [])
      } catch (error) {
        console.error('Failed to load workspaces:', error)
      }
    }
    loadWorkspaces()
  }, [])

  const currentWorkspace = workspaces.find(w => w.id === workspaceId)

  // Filter workspaces by active organization
  const filteredWorkspaces = activeOrganization
    ? workspaces.filter(w => w.organization === activeOrganization.id)
    : workspaces

  const sidebarWidth = isMobile ? 0 : (isOpen ? 240 : 64)

  const handleOrganizationSelect = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId)
    if (org) {
      setActiveOrganization(org)
      // Navigate to organization global map view
      navigate(`/organizations/${orgId}/map`)
    }
  }

  const handleWorkspaceSelect = (workspaceId: string) => {
    const workspace = workspaces.find(w => w.id === workspaceId)
    if (workspace) {
      navigate(`/organizations/${workspace.organization}/workspaces/${workspace.id}/map`)
    }
  }

  const handleHelp = () => {
    window.open('/help', '_blank')
  }

  const handleProfile = () => {
    navigate('/profile')
  }

  const toolbarActions = [
    ...(organizations.length > 1 ? [{
      label: `Organization: ${activeOrganization?.name || 'None'}`,
      icon: <BusinessIcon fontSize="small" />,
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: Infinity, // Always in menu at the top
      dividerAfter: windowWidth >= 600, // Show divider when workspace is visible as button
      submenu: organizations.map(org => ({
        id: org.id,
        label: org.name,
        selected: org.id === activeOrganization?.id,
        onClick: () => handleOrganizationSelect(org.id)
      }))
    }] : []),

    ...(organizationId ? [{
      label: workspaceId ? (currentWorkspace?.name || 'Switch Workspace') : 'Global',
      icon: <SwapHorizIcon fontSize="small" />,
      minWidth: 600, // Show when window >= 600px
      dividerAfter: windowWidth < 600, // Show divider when collapsed into menu
      submenu: [
        {
          id: 'global',
          label: 'Global',
          selected: !workspaceId,
          onClick: () => navigate(`/organizations/${organizationId}/map`)
        },
        ...filteredWorkspaces.map(ws => ({
          id: ws.id,
          label: ws.name,
          selected: ws.id === workspaceId,
          onClick: () => handleWorkspaceSelect(ws.id)
        })),
        {
          id: 'manage-workspaces',
          label: 'Manage Workspaces',
          dividerAfter: false,
          onClick: () => navigate(`/organizations/${organizationId}/workspaces`)
        }
      ],
      customComponent: (
        <Button
          size="small"
          variant="text"
          color="inherit"
          startIcon={<SwapHorizIcon fontSize="small" />}
          sx={{ mr: 0.5, whiteSpace: 'nowrap', textTransform: 'none' }}
        >
          {workspaceId ? (currentWorkspace?.name || 'Switch Workspace') : 'Global'}
        </Button>
      )
    }] : []),
    {
      label: 'Profile',
      icon: <PersonIcon fontSize="small" />,
      onClick: handleProfile,
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: Infinity,
    },
    {
      label: 'Help',
      icon: <HelpIcon fontSize="small" />,
      onClick: handleHelp,
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: 500, // Show when window >= 500px
      dividerAfter: true // Divider after Profile when in menu
    },
    {
      label: isDarkMode ? 'Toggle Light Mode' : 'Toggle Dark Mode',
      icon: isDarkMode ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />,
      onClick: toggleTheme,
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: 0 // Always visible as icon button
    },

    {
      label: 'Logout',
      icon: <LogoutIcon fontSize="small" />,
      onClick: () => console.log('Logout clicked'),
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: Infinity // Always in menu
    }
  ]

  return (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      {!isMobile && (
        <Sidebar
          isOpen={isOpen}
          onToggle={setIsOpen}
          variant="permanent"
          onClose={undefined}
        />
      )}
      <AppBar position="fixed" color="primary" elevation={0}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Asset Visualizer
          </Typography>
          <ActionButtons
            actions={toolbarActions}
            iconOnly
            size="small"
            spacing={0.5}
            width={windowWidth}
            menuIcon={<AccountCircleIcon />}
          />
        </Toolbar>
        {isNavigating && <LinearProgress color="secondary" />}
      </AppBar>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: `calc(100% - ${sidebarWidth}px)`, ml: `${sidebarWidth}px`, pb: isMobile ? 7 : 0, transition: 'margin 225ms cubic-bezier(0.4, 0, 0.6, 1), width 225ms cubic-bezier(0.4, 0, 0.6, 1)' }}>
        {!hideBreadcrumbs && (
          <Box sx={{ p: 2, pb: 0, mt: 8 }}>
            <AppBreadcrumbs />
          </Box>
        )}
        <Box sx={{ flexGrow: 1, overflow: 'hidden', height: '100%' }}>
          <Suspense fallback={
            <Box display="flex" justifyContent="center" alignItems="center" height="100%" width="100%">
              <CircularProgress />
            </Box>
          }>
            <Outlet />
          </Suspense>
        </Box>
      </Box>
      {isMobile && (
        <BottomNavigation
          value={getBottomNavValue()}
          onChange={handleBottomNavChange}
          showLabels={true}
          sx={{
            position: 'fixed',
            bottom: 0,
            width: '100%',
            zIndex: 1100,
            backgroundColor: 'primary.main',
            '& .MuiBottomNavigationAction-root': {
              color: 'white',
              '&.Mui-selected': {
                color: 'secondary.light',
              },
              '&:hover': {
                color: 'secondary.light',
              },
            },
          }}
        >
          <BottomNavigationAction label="Map" value="map" icon={<MapIcon />} />
          <BottomNavigationAction label="Assets" value="assets" icon={<AssetsIcon />} />
          <BottomNavigationAction label="Library" value="library" icon={<LibraryIcon />} />
        </BottomNavigation>
      )}
    </Box>
  )
}

export default App
