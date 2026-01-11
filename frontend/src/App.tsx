import { Suspense, useState, useEffect } from 'react'
import { Outlet, useNavigation } from 'react-router-dom'
import { AppBar, Toolbar, Box, Typography, CircularProgress, LinearProgress } from '@mui/material'
import Sidebar from './components/Sidebar'
import ThemeToggle from './components/ThemeToggle'
import AppBreadcrumbs from './components/AppBreadcrumbs'

function App() {
  const navigation = useNavigation()
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

  return (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <Sidebar isOpen={sidebarOpen} onToggle={setSidebarOpen} />
      <AppBar position="fixed" color="primary" elevation={0} sx={{ zIndex: 1301 }}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Asset Visualizer
          </Typography>
          <ThemeToggle />
        </Toolbar>
        {isNavigating && <LinearProgress color="secondary" />}
      </AppBar>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: `calc(100% - ${sidebarWidth}px)`, ml: `${sidebarWidth}px`, mt: 8, transition: 'margin 225ms cubic-bezier(0.4, 0, 0.6, 1), width 225ms cubic-bezier(0.4, 0, 0.6, 1)' }}>
        <Box sx={{ p: 2, pb: 0 }}>
          <AppBreadcrumbs />
        </Box>
        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
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
