import { useState, useEffect, useCallback, type CSSProperties } from 'react'
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
import { Computer as ComputerIcon } from '@mui/icons-material'
import { useOutletContext } from 'react-router-dom'
import InfiniteLoaderList from '../../components/InfiniteLoaderList'
import { authFetch } from '../../api/authFetch'

interface Session {
  id: string
  device: string | null
  location: string | null
  ip_address: string | null
  device_type: string
  browser: string
  operating_system: string
  created_at: string
  last_activity_at: string
  logged_out_at: string | null
  is_current: boolean
}

interface SecurityContext {
  userId: string | null
}

const PAGE_SIZE = 20

export default function SessionsPage() {
  const { userId } = useOutletContext<SecurityContext>()
  const [sessions, setSessions] = useState<Map<number, Session>>(new Map())
  const [sessionsTotalCount, setSessionsTotalCount] = useState(0)
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
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

  // Fetch sessions with limit/offset pagination
  const fetchSessions = useCallback(async (offset: number, limit: number) => {
    if (!userId) return

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

  // Load initial sessions when we have the user ID
  useEffect(() => {
    if (userId) {
      fetchSessions(0, PAGE_SIZE)
    }
  }, [userId, fetchSessions])

  // Handle infinite loader requesting more data
  const handleLoadRange = useCallback((startIndex: number, endIndex: number) => {
    const offset = startIndex
    const limit = endIndex - startIndex + 1
    fetchSessions(offset, limit)
  }, [fetchSessions])

  const handleRevokeSession = useCallback(async (sessionId: string) => {
    if (!userId) return

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

  const renderSessionItem = useCallback((session: Session, _index: number, _style: CSSProperties) => (
    <ListItem
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
      }}
      secondaryAction={
        session.is_current ? (
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
        <ComputerIcon />
      </ListItemIcon>
      <ListItemText
        primary={session.device || session.browser || 'Unknown device'}
        secondary={
          <>
            {session.location || session.ip_address || 'Unknown location'} &bull; {formatRelativeTime(session.last_activity_at)}
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
