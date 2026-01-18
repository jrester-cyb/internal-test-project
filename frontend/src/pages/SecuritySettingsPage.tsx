import { useCallback, useMemo } from 'react'
import { Paper, Box, Container } from '@mui/material'
import { useLocation, Outlet, useLoaderData } from 'react-router-dom'
import type { SecurityLayoutLoaderData } from '../loaders/security'
import {
  prefetchSessions,
  prefetchMfaDevices,
  prefetchPassword,
} from '../utils/preload'
import NavTabBar, { type NavTab } from '../components/NavTabBar'

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

  const tabs: NavTab[] = useMemo(
    () => [
      {
        label: 'Sessions',
        to: '/profile/security/sessions',
        onMouseEnter: handlePrefetchSessions,
      },
      {
        label: 'MFA Devices',
        to: '/profile/security/mfa',
        onMouseEnter: prefetchMfaDevices,
      },
      {
        label: 'Password',
        to: '/profile/security/password',
        onMouseEnter: prefetchPassword,
      },
    ],
    [handlePrefetchSessions]
  )

  return (
    <Container maxWidth={false} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <NavTabBar tabs={tabs} currentTab={currentTab} />

      {/* Content */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', mt: 2 }}>
        <Paper sx={{ p: 3, borderRadius: 1 }}>
          <Outlet context={{ userId }} />
        </Paper>
      </Box>
    </Container>
  )
}
