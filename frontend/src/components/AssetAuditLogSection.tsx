import { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  CircularProgress,
  Card,
  CardHeader,
  CardContent,
  Chip,
  Stack,
  Tooltip,
  IconButton,
} from '@mui/material'
import {
  Refresh as RefreshIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material'
import { fetchAssetAuditLog, fetchAssetTypeAuditLog, type AuditLogItem, type AuditLogEntry, type AuditLogResponse } from '../api/auditLog'

interface AuditLogSectionProps {
  objectId: string
  fetchFn: (id: string, pageSize: number) => Promise<AuditLogResponse>
  emptyMessage?: string
}

function getActionIcon(action: string) {
  switch (action.toLowerCase()) {
    case 'create':
    case 'created':
      return <AddIcon fontSize="small" />
    case 'update':
    case 'updated':
      return <EditIcon fontSize="small" />
    case 'delete':
    case 'deleted':
      return <DeleteIcon fontSize="small" />
    default:
      return <ViewIcon fontSize="small" />
  }
}

function getActionColor(action: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (action.toLowerCase()) {
    case 'create':
    case 'created':
      return 'success'
    case 'update':
    case 'updated':
      return 'warning'
    case 'delete':
    case 'deleted':
      return 'error'
    default:
      return 'info'
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString()
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 7) {
    return date.toLocaleDateString()
  } else if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  } else if (diffMins > 0) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  } else {
    return 'Just now'
  }
}

interface AuditLogEntryItemProps {
  entry: AuditLogEntry | Omit<AuditLogEntry, 'type'>
  showUser?: boolean
  username?: string
  userEmail?: string
}

function AuditLogEntryItem({ entry, showUser = true, username, userEmail }: AuditLogEntryItemProps) {
  const displayUsername = username || (entry as AuditLogEntry).username
  const displayEmail = userEmail || (entry as AuditLogEntry).user_email

  return (
    <Box sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 'none' } }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Chip
          icon={getActionIcon(entry.action)}
          label={entry.action}
          size="small"
          color={getActionColor(entry.action)}
          variant="outlined"
        />
        <Tooltip title={formatDate(entry.created_at)}>
          <Typography variant="caption" color="text.secondary">
            {formatRelativeTime(entry.created_at)}
          </Typography>
        </Tooltip>
      </Stack>

      {entry.message && (
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          {entry.message}
        </Typography>
      )}

      {showUser && displayUsername && (
        <Typography variant="caption" color="text.secondary">
          by {displayUsername}
          {displayEmail && ` (${displayEmail})`}
        </Typography>
      )}

      {entry.changes && Object.keys(entry.changes).length > 0 && (
        <Box sx={{ mt: 1, pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Changes:
          </Typography>
          {Object.entries(entry.changes).map(([field, change]) => (
            <Box key={field} sx={{ mt: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 500 }}>
                {field}:
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {typeof change === 'object' && change !== null ? (
                  <>
                    {change.old !== undefined && (
                      <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>
                        {JSON.stringify(change.old)}
                      </span>
                    )}
                    {change.old !== undefined && change.new !== undefined && ' → '}
                    {change.new !== undefined && <span>{JSON.stringify(change.new)}</span>}
                  </>
                ) : (
                  JSON.stringify(change)
                )}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

export default function AuditLogSection({ objectId, fetchFn, emptyMessage = 'No audit history found.' }: AuditLogSectionProps) {
  const [items, setItems] = useState<AuditLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  const loadAuditLog = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchFn(objectId, 20)
      setItems(response.results)
      setTotalCount(response.count)
    } catch (err) {
      console.error('Error loading audit log:', err)
      setError('Failed to load audit history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAuditLog()
  }, [objectId])

  const handleRefresh = () => {
    loadAuditLog()
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title="Audit History"
        action={
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={handleRefresh} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        ) : items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {emptyMessage}
          </Typography>
        ) : (
          <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
            {items.map((item) => {
              if (item.type === 'group') {
                return (
                  <Box key={item.group.id} sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      {item.group.description || 'Grouped changes'}
                    </Typography>
                    {item.entries.map((entry) => (
                      <AuditLogEntryItem
                        key={entry.id}
                        entry={entry}
                        username={item.username}
                        userEmail={item.user_email}
                      />
                    ))}
                  </Box>
                )
              } else {
                return <AuditLogEntryItem key={item.id} entry={item} />
              }
            })}
            {totalCount > items.length && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                Showing {items.length} of {totalCount} entries
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

// Convenience components for specific use cases
export function AssetAuditLogSection({ assetId }: { assetId: string }) {
  return (
    <AuditLogSection
      objectId={assetId}
      fetchFn={fetchAssetAuditLog}
      emptyMessage="No audit history found for this asset."
    />
  )
}

export function AssetTypeAuditLogSection({ assetTypeId }: { assetTypeId: string }) {
  return (
    <AuditLogSection
      objectId={assetTypeId}
      fetchFn={fetchAssetTypeAuditLog}
      emptyMessage="No audit history found for this asset type."
    />
  )
}
