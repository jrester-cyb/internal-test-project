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
const getTabFromPath = (pathname: string, hasPasswordTab: boolean): number => {
  if (pathname.includes('/sessions')) return 0
  if (pathname.includes('/mfa')) return 1
  if (pathname.includes('/password') && hasPasswordTab) return 2
  return 0 // Default to sessions
}

export default function SecuritySettingsPage() {
  const location = useLocation()
  const { userId, isOwnProfile } = useLoaderData() as SecurityLayoutLoaderData

  const currentTab = getTabFromPath(location.pathname, isOwnProfile)

  const handlePrefetchSessions = useCallback(() => {
    prefetchSessions(userId)
  }, [userId])

  const tabs: NavTab[] = useMemo(
    () => {
      const baseTabs: NavTab[] = [
        {
          label: 'Sessions',
          to: 'sessions',
          onMouseEnter: handlePrefetchSessions,
        },
        {
          label: 'MFA Devices',
          to: 'mfa',
          onMouseEnter: prefetchMfaDevices,
        },
      ]

      // Only show password tab for own profile
      if (isOwnProfile) {
        baseTabs.push({
          label: 'Password',
          to: 'password',
          onMouseEnter: prefetchPassword,
        })
      }

      return baseTabs
    },
    [handlePrefetchSessions, isOwnProfile]
  )

  return (
    <Container maxWidth={false} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <NavTabBar tabs={tabs} currentTab={currentTab} />

      {/* Content */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', mt: 2 }}>
        <Paper sx={{ p: 3, mb: 2, borderRadius: 1, flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Outlet context={{ userId }} />
        </Paper>
      </Box>
    </Container>
  )
}
