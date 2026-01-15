import { Suspense, useState, useEffect } from 'react'
import { Outlet, useNavigation, useNavigate, useParams, useMatches } from 'react-router-dom'
import { AppBar, Toolbar, Box, Typography, CircularProgress, LinearProgress, Button } from '@mui/material'
import { Help as HelpIcon, Person as PersonIcon, AccountCircle as AccountCircleIcon, SwapHoriz as SwapHorizIcon, DarkMode as DarkModeIcon, LightMode as LightModeIcon, Logout as LogoutIcon, Business as BusinessIcon } from '@mui/icons-material'
import Sidebar from './components/Sidebar'
import AppBreadcrumbs from './components/AppBreadcrumbs'
import ActionButtons from './components/ActionButtons'
import { fetchWorkspaces } from './api/assets'
import { useTheme } from './contexts/ThemeContext'
import { useOrganization } from './contexts/OrganizationContext'

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
  const isNavigating = Boolean(navigation.location);

  // Check if any matched route has hideBreadcrumbs set to true
  const hideBreadcrumbs = matches.some((match) => (match.handle as any)?.hideBreadcrumbs)

  // Initialize sidebar state from localStorage or default to true
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem('sidebarOpen')
    return stored !== null ? JSON.parse(stored) : true
  })

  const sidebarWidth = sidebarOpen ? 240 : 64

  // Save sidebar state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('sidebarOpen', JSON.stringify(sidebarOpen))
  }, [sidebarOpen])

  // Workspaces for switcher
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

  // Window width for responsive toolbar
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  const handleOrganizationSelect = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId)
    if (org) {
      setActiveOrganization(org)
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
      dividerAfter: true,
      submenu: organizations.map(org => ({
        id: org.id,
        label: org.name,
        selected: org.id === activeOrganization?.id,
        onClick: () => handleOrganizationSelect(org.id)
      }))
    }] : []),

    ...(workspaceId ? [{
      label: currentWorkspace?.name || 'Switch Workspace',
      icon: <SwapHorizIcon fontSize="small" />,
      minWidth: 600, // Show when window >= 600px
      submenu: filteredWorkspaces.map(ws => ({
        id: ws.id,
        label: ws.name,
        selected: ws.id === workspaceId,
        onClick: () => handleWorkspaceSelect(ws.id)
      })),
      customComponent: (
        <Button
          size="small"
          variant="text"
          color="inherit"
          startIcon={<SwapHorizIcon fontSize="small" />}
          sx={{ mr: 0.5, whiteSpace: 'nowrap', textTransform: 'none' }}
        >
          {currentWorkspace?.name || 'Switch Workspace'}
        </Button>
      )
    }] : []),

    {
      label: 'Help',
      icon: <HelpIcon fontSize="small" />,
      onClick: handleHelp,
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: 500 // Show when window >= 500px
    },
    {
      label: 'Profile',
      icon: <PersonIcon fontSize="small" />,
      onClick: handleProfile,
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: Infinity
    },
    {
      label: isDarkMode ? 'Toggle Light Mode' : 'Toggle Dark Mode',
      icon: isDarkMode ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />,
      onClick: toggleTheme,
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: Infinity // Always in menu
    },
    {
      label: 'Logout',
      icon: <LogoutIcon fontSize="small" />,
      onClick: () => console.log('Logout clicked'),
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: Infinity, // Always in menu
      dividerBefore: true
    }
  ]

  return (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <Sidebar isOpen={sidebarOpen} onToggle={setSidebarOpen} />
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

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: `calc(100% - ${sidebarWidth}px)`, ml: `${sidebarWidth}px`, mt: 8, transition: 'margin 225ms cubic-bezier(0.4, 0, 0.6, 1), width 225ms cubic-bezier(0.4, 0, 0.6, 1)' }}>
        {!hideBreadcrumbs && (
          <Box sx={{ p: 2, pb: 0 }}>
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
    </Box>
  )
}

export default App
