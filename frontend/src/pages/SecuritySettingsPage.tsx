import { useCallback } from 'react'
import {
  Paper,
  Box,
  Tabs,
  Tab,
  Container,
} from '@mui/material'
import { Link, useLocation, Outlet, useLoaderData } from 'react-router-dom'
import type { SecurityLayoutLoaderData } from '../loaders/security'
import {
  prefetchSessions,
  prefetchMfaDevices,
  prefetchPassword,
} from '../utils/preload'

// Map path to tab index
const getTabFromPath = (pathname: string): number => {
  if (pathname.includes('/sessions')) return 0
  if (pathname.includes('/mfa')) return 1
  if (pathname.includes('/password')) return 2
  return 0 // Default to sessions
}

export default function SecuritySettingsPage() {
  const location = useLocation()
  const currentTab = getTabFromPath(location.pathname)
  const { userId } = useLoaderData() as SecurityLayoutLoaderData

  const handlePrefetchSessions = useCallback(() => {
    prefetchSessions(userId)
  }, [userId])

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
      <Container maxWidth={false} disableGutters>
        {/* Tab Bar */}
        <Box
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: '8px 8px 0 0',
            '& .MuiTabs-indicator': {
              bgcolor: 'secondary.main',
            },
            '& .MuiTab-root': {
              color: 'rgba(255, 255, 255, 0.7)',
              '&.Mui-selected': {
                color: '#ffffff',
              },
            },
          }}
        >
          <Tabs value={currentTab} textColor="inherit">
            <Tab
              label="Sessions"
              component={Link}
              to="/profile/security/sessions"
              onMouseEnter={handlePrefetchSessions}
            />
            <Tab
              label="MFA Devices"
              component={Link}
              to="/profile/security/mfa"
              onMouseEnter={prefetchMfaDevices}
            />
            <Tab
              label="Password"
              component={Link}
              to="/profile/security/password"
              onMouseEnter={prefetchPassword}
            />
          </Tabs>
        </Box>

        {/* Content */}
        <Paper sx={{ p: 3, borderRadius: '0 0 8px 8px' }}>
          <Outlet context={{ userId }} />
        </Paper>
      </Container>
    </Box>
  )
}
