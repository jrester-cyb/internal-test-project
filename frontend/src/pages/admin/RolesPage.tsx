import { useMemo } from 'react'
import { Paper, Box, Typography } from '@mui/material'
import { useLocation, Outlet } from 'react-router-dom'
import NavTabBar, { type NavTab } from '../../components/NavTabBar'

const getTabFromPath = (pathname: string): number => {
  if (pathname.includes('/instance')) return 0
  if (pathname.includes('/organization')) return 1
  if (pathname.includes('/workspace')) return 2
  return 0
}

export default function RolesPage() {
  const location = useLocation()
  const currentTab = getTabFromPath(location.pathname)

  const tabs: NavTab[] = useMemo(
    () => [
      {
        label: 'Instance Roles',
        to: '/settings/roles/instance',
      },
      {
        label: 'Organization Roles',
        to: '/settings/roles/organization',
      },
      {
        label: 'Workspace Roles',
        to: '/settings/roles/workspace',
      },
    ],
    []
  )

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h1" fontWeight={600}>
          Role Management
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Create and manage roles to control what users can do at different levels of the system.
        </Typography>
      </Box>

      <NavTabBar tabs={tabs} currentTab={currentTab} />

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', mt: 2 }}>
        <Paper sx={{ p: 3, borderRadius: 1, flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Outlet />
        </Paper>
      </Box>
    </Box>
  )
}
