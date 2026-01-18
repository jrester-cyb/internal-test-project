import { useState, useCallback, type CSSProperties } from 'react'
import {
  Typography,
  Box,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Button,
  Skeleton,
} from '@mui/material'
import {
  Computer as ComputerIcon,
  PhoneAndroid as PhoneIcon,
  Tablet as TabletIcon,
} from '@mui/icons-material'
import { useLoaderData } from 'react-router-dom'
import InfiniteLoaderList from '../../components/InfiniteLoaderList'
import { authFetch } from '../../api/authFetch'
import type { Session, SessionsLoaderData } from '../../loaders/security'

const PAGE_SIZE = 20

export default function SessionsPage() {
  const loaderData = useLoaderData() as SessionsLoaderData
  const [sessions, setSessions] = useState<Map<number, Session>>(loaderData.sessions)
  const [sessionsTotalCount, setSessionsTotalCount] = useState(loaderData.totalCount)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const userId = loaderData.userId

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return null

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  // Fetch more sessions with limit/offset pagination
  const fetchMoreSessions = useCallback(async (offset: number, limit: number) => {
    setSessionsLoading(true)
    try {
      const response = await authFetch(
        `/api/auth/v2/users/${userId}/sessions/?limit=${limit}&offset=${offset}`
      )
      if (!response.ok) throw new Error('Failed to fetch sessions')
      const data = await response.json()

      // Update total count
      setSessionsTotalCount(data.count)

      // Add results to the Map at the correct indices
      setSessions(prev => {
        const newMap = new Map(prev)
        data.results.forEach((session: Session, index: number) => {
          newMap.set(offset + index, session)
        })
        return newMap
      })
    } catch (err) {
      console.error('Failed to load sessions', err)
    } finally {
      setSessionsLoading(false)
    }
  }, [userId])

  // Handle infinite loader requesting more data
  const handleLoadRange = useCallback((startIndex: number, endIndex: number) => {
    const offset = startIndex
    const limit = endIndex - startIndex + 1
    fetchMoreSessions(offset, limit)
  }, [fetchMoreSessions])

  const handleRevokeSession = useCallback(async (sessionId: string) => {
    try {
      const response = await authFetch(`/api/auth/v2/users/${userId}/sessions/${sessionId}/`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to revoke session')
      // Remove the session from the Map and decrement total count
      setSessions(prev => {
        const newMap = new Map<number, Session>()
        let skipped = false
        for (const [index, session] of prev.entries()) {
          if (session.id === sessionId) {
            skipped = true
            continue
          }
          newMap.set(skipped ? index - 1 : index, session)
        }
        return newMap
      })
      setSessionsTotalCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Failed to revoke session', err)
    }
  }, [userId])

  const getDeviceIcon = (deviceType: string) => {
    const type = deviceType?.toLowerCase()
    if (type?.includes('mobile') || type?.includes('phone')) return <PhoneIcon />
    if (type?.includes('tablet')) return <TabletIcon />
    return <ComputerIcon />
  }

  const getDeviceTitle = (session: Session) => {
    // Use the device field if available (pre-formatted by backend)
    if (session.device) return session.device

    // Otherwise build from browser and OS
    const parts = [session.browser, session.operatingSystem].filter(Boolean)
    if (parts.length > 0) return parts.join(' on ')

    return 'Unknown device'
  }

  const renderSessionItem = useCallback((session: Session, _index: number, _style: CSSProperties) => (
    <ListItem
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
      }}
      secondaryAction={
        session.isCurrent ? (
          <Chip label="Current" size="small" color="primary" />
        ) : (
          <Button
            size="small"
            color="error"
            onClick={() => handleRevokeSession(session.id)}
          >
            Revoke
          </Button>
        )
      }
    >
      <ListItemIcon sx={{ color: 'text.secondary' }}>
        {getDeviceIcon(session.deviceType)}
      </ListItemIcon>
      <ListItemText
        primary={getDeviceTitle(session)}
        secondary={
          <>
            {[
              session.location || session.ipAddress,
              formatRelativeTime(session.lastActivityAt),
            ].filter(Boolean).join(' \u2022 ')}
          </>
        }
      />
    </ListItem>
  ), [handleRevokeSession])

  const sessionLoadingPlaceholder = (
    <Box sx={{ py: 1, px: 2 }}>
      <Skeleton variant="text" width="40%" height={24} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
        <Skeleton variant="text" width={120} height={16} />
      </Box>
    </Box>
  )

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        These are the devices currently logged into your account. You can revoke access to any session.
      </Typography>

      <Box sx={{ height: 400 }}>
        <InfiniteLoaderList<Session>
          items={sessions}
          totalCount={sessionsTotalCount}
          getItemKey={(session) => session.id}
          renderItem={renderSessionItem}
          onLoadRange={handleLoadRange}
          isLoading={sessionsLoading}
          estimatedItemHeight={72}
          itemGap={8}
          emptyMessage="No active sessions found."
          emptyDescription="Sessions will appear here when you sign in on a device."
          loadingPlaceholder={sessionLoadingPlaceholder}
        />
      </Box>
    </>
  )
}
