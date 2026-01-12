import { Suspense, useState, useEffect } from 'react'
import { Outlet, useNavigation, useNavigate, useParams } from 'react-router-dom'
import { AppBar, Toolbar, Box, Typography, CircularProgress, LinearProgress, Menu, MenuItem } from '@mui/material'
import { Help as HelpIcon, Person as PersonIcon, AccountCircle as AccountCircleIcon, SwapHoriz as SwapHorizIcon, DarkMode as DarkModeIcon, LightMode as LightModeIcon, Logout as LogoutIcon } from '@mui/icons-material'
import Sidebar from './components/Sidebar'
import AppBreadcrumbs from './components/AppBreadcrumbs'
import ActionButtons from './components/ActionButtons'
import { fetchWorkspaces } from './api/assets'
import { useTheme } from './contexts/ThemeContext'

interface Workspace {
  id: string
  name: string
}

function App() {
  const navigation = useNavigation()
  const navigate = useNavigate()
  const { workspaceId } = useParams()
  const { isDarkMode, toggleTheme } = useTheme()
  const isNavigating = Boolean(navigation.location);

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

  // Action buttons menu state for responsive collapse
  const [actionsMenuAnchorEl, setActionsMenuAnchorEl] = useState<null | HTMLElement>(null)

  // Workspace switcher menu state
  const [workspaceAnchorEl, setWorkspaceAnchorEl] = useState<null | HTMLElement>(null)
  const workspaceMenuOpen = Boolean(workspaceAnchorEl)

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

  const handleWorkspaceClick = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) setWorkspaceAnchorEl(event.currentTarget)
  }

  const handleWorkspaceClose = () => {
    setWorkspaceAnchorEl(null)
  }

  const handleWorkspaceSelect = (id: string) => {
    navigate(`/workspaces/${id}/map`)
    handleWorkspaceClose()
  }

  const handleHelp = () => {
    window.open('/help', '_blank')
  }

  const handleProfile = () => {
    navigate('/profile')
  }

  const toolbarActions = [
    ...(workspaceId ? [{
      label: currentWorkspace?.name || 'Switch Workspace',
      icon: <SwapHorizIcon fontSize="small" />,
      onClick: handleWorkspaceClick,
      color: 'inherit' as const,
      variant: 'text' as const,
      collapseThreshold: 600 // Show when window >= 600px
    }] : []),

    {
      label: 'Help',
      icon: <HelpIcon fontSize="small" />,
      onClick: handleHelp,
      color: 'inherit' as const,
      variant: 'text' as const,
      collapseThreshold: 500 // Show when window >= 500px
    },
    {
      label: 'Profile',
      icon: <PersonIcon fontSize="small" />,
      onClick: handleProfile,
      color: 'inherit' as const,
      variant: 'text' as const,
      collapseThreshold: Infinity
    },
    {
      label: isDarkMode ? 'Toggle Light Mode' : 'Toggle Dark Mode',
      icon: isDarkMode ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />,
      onClick: toggleTheme,
      color: 'inherit' as const,
      variant: 'text' as const,
      collapseThreshold: Infinity // Show when window >= 550px
    },
    {
      label: 'Logout',
      icon: <LogoutIcon fontSize="small" />,
      onClick: () => console.log('Logout clicked'),
      color: 'inherit' as const,
      variant: 'text' as const,
      collapseThreshold: Infinity, // Show when window >= 400px
      dividerBefore: true
    }
  ]

  return (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <Sidebar isOpen={sidebarOpen} onToggle={setSidebarOpen} />
      <AppBar position="fixed" color="primary" elevation={0} sx={{ zIndex: 1301 }}>
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
            menuAnchorEl={actionsMenuAnchorEl}
            setMenuAnchorEl={setActionsMenuAnchorEl}
            showWhenWider
            menuIcon={<AccountCircleIcon />}
          />
        </Toolbar>
        {isNavigating && <LinearProgress color="secondary" />}
      </AppBar>

      {/* Workspace Switcher Menu */}
      <Menu
        anchorEl={workspaceAnchorEl}
        open={workspaceMenuOpen}
        onClose={handleWorkspaceClose}
        sx={{ zIndex: 1400 }}
      >
        {workspaces.map((ws) => (
          <MenuItem
            key={ws.id}
            selected={ws.id === workspaceId}
            onClick={() => handleWorkspaceSelect(ws.id)}
          >
            {ws.name}
          </MenuItem>
        ))}
      </Menu>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: `calc(100% - ${sidebarWidth}px)`, ml: `${sidebarWidth}px`, mt: 8, transition: 'margin 225ms cubic-bezier(0.4, 0, 0.6, 1), width 225ms cubic-bezier(0.4, 0, 0.6, 1)' }}>
        <Box sx={{ p: 2, pb: 0 }}>
          <AppBreadcrumbs />
        </Box>
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
