import { Suspense } from 'react'
import { Outlet, useNavigation } from 'react-router-dom'
import { AppBar, Toolbar, Box, Typography, CircularProgress, LinearProgress } from '@mui/material'
import Sidebar from './components/Sidebar'
import ThemeToggle from './components/ThemeToggle'
import AppBreadcrumbs from './components/AppBreadcrumbs'

function App() {
  const navigation = useNavigation()
  const isNavigating = Boolean(navigation.location);

  return (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <Sidebar />
      <AppBar position="fixed" sx={{ zIndex: 1301, boxShadow: 'none' }}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Asset Visualizer
          </Typography>
          <ThemeToggle />
        </Toolbar>
        {isNavigating && <LinearProgress />}
      </AppBar>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: 'calc(100% - 240px)', ml: '240px', mt: 8 }}>
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
