import { useState, useEffect } from 'react'
import {
  Paper,
  Box,
  Tabs,
  Tab,
  Container,
} from '@mui/material'
import { Link, useLocation, Outlet } from 'react-router-dom'
import { authFetch } from '../api/authFetch'

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
  const [userId, setUserId] = useState<string | null>(null)

  // Fetch user profile to get user ID
  useEffect(() => {
    async function fetchUserProfile() {
      try {
        const response = await authFetch('/api/auth/v2/whoami/')
        if (!response.ok) throw new Error('Failed to fetch user profile')
        const data = await response.json()
        setUserId(data.id)
      } catch (err) {
        console.error('Failed to load user profile', err)
      }
    }

    fetchUserProfile()
  }, [])

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
            />
            <Tab
              label="MFA Devices"
              component={Link}
              to="/profile/security/mfa"
            />
            <Tab
              label="Password"
              component={Link}
              to="/profile/security/password"
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
