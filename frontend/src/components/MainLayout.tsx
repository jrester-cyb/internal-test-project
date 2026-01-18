import { Suspense } from 'react'
import { Outlet, useLoaderData } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import { OrganizationProvider } from '@app/contexts/OrganizationContext'
import { LayoutProvider, useLayout } from '@app/contexts/LayoutContext'
import PvAppBar from '@app/components/PvAppBar'
import Sidebar from '@app/components/Sidebar'
import type { Organization } from '@app/types'

function MainLayoutContent() {
  const { sidebarOpen, isMobile, hideSidebar } = useLayout()

  // Calculate sidebar width for main content offset
  const sidebarWidth = hideSidebar ? 0 : (isMobile ? 0 : (sidebarOpen ? 240 : 64))

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
        <Suspense fallback={
          <Box display="flex" justifyContent="center" alignItems="center" height="100%" width="100%">
            <CircularProgress />
          </Box>
        }>
          <Outlet />
        </Suspense>
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
