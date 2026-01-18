import { useState, useEffect } from 'react'
import {
  Typography,
  Paper,
  Box,
  Avatar,
  Divider,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Alert,
} from '@mui/material'
import {
  Security as SecurityIcon,
  Edit as EditIcon,
  History as HistoryIcon,
} from '@mui/icons-material'
import { useNavigate, Link } from 'react-router-dom'

interface UserProfile {
  id: string
  email: string
  first_name: string
  last_name: string
  username: string
  job_title?: string
}

interface ActivityItem {
  id: string
  action: string
  timestamp: string
  details?: string
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editFormData, setEditFormData] = useState({ first_name: '', last_name: '' })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Placeholder activity data
  const [activities] = useState<ActivityItem[]>([
    { id: '1', action: 'Logged in', timestamp: new Date().toISOString(), details: 'From Chrome on Windows' },
    { id: '2', action: 'Updated profile', timestamp: new Date(Date.now() - 86400000).toISOString() },
    { id: '3', action: 'Changed password', timestamp: new Date(Date.now() - 172800000).toISOString() },
    { id: '4', action: 'Logged in', timestamp: new Date(Date.now() - 259200000).toISOString(), details: 'From Safari on macOS' },
    { id: '5', action: 'Added MFA device', timestamp: new Date(Date.now() - 345600000).toISOString(), details: 'Authenticator App' },
  ])

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch('/api/auth/v2/whoami/', { credentials: 'include' })
        if (!response.ok) throw new Error('Failed to fetch profile')
        const data = await response.json()
        setProfile(data)
      } catch (err) {
        console.error('Failed to load profile', err)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  const handleOpenEditDialog = () => {
    setEditFormData({
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
    })
    setEditError(null)
    setEditDialogOpen(true)
  }

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false)
    setEditError(null)
  }

  const handleEditFormChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditFormData(prev => ({ ...prev, [field]: e.target.value }))
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    setEditError(null)

    try {
      const response = await fetch('/api/auth/v2/profile/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editFormData),
      })
      if (!response.ok) throw new Error('Failed to update profile')
      const updatedProfile = await response.json()
      setProfile(updatedProfile)
      setEditDialogOpen(false)
    } catch (err) {
      setEditError('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

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

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  const displayName = profile?.first_name || profile?.last_name
    ? `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
    : profile?.username || 'User'

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
      <Box sx={{ display: 'flex', gap: 3, maxWidth: 1200, mx: 'auto' }}>
        {/* Left Column - Profile Info */}
        <Paper sx={{ width: 300, flexShrink: 0, p: 3, alignSelf: 'flex-start' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Avatar
              sx={{
                width: 100,
                height: 100,
                mb: 2,
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'primary.light' : 'primary.main',
                color: (theme) => theme.palette.mode === 'dark' ? 'primary.contrastText' : 'primary.contrastText',
                fontSize: 40,
              }}
            >
              {displayName.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="h6" align="center">
              {displayName}
            </Typography>
            {profile?.job_title && (
              <Typography variant="body2" color="text.secondary" align="center">
                {profile.job_title}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" align="center">
              {profile?.email}
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          <List disablePadding>
            <ListItem
              component="button"
              onClick={handleOpenEditDialog}
              sx={{
                borderRadius: 1,
                mb: 1,
                '&:hover': { bgcolor: 'action.hover' },
                cursor: 'pointer',
                border: 'none',
                bgcolor: 'transparent',
                color: 'text.primary',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
                <EditIcon />
              </ListItemIcon>
              <ListItemText primary="Edit Profile" />
            </ListItem>
            <ListItem
              component={Link}
              to="/profile/security"
              sx={{
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
                cursor: 'pointer',
                border: 'none',
                bgcolor: 'transparent',
                color: 'text.primary',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
                <SecurityIcon />
              </ListItemIcon>
              <ListItemText primary="Security Settings" />
            </ListItem>
          </List>
        </Paper>

        {/* Center Column - Activity Stream */}
        <Paper sx={{ flex: 1, p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <HistoryIcon sx={{ mr: 1, color: 'text.secondary' }} />
            <Typography variant="h6">Recent Activity</Typography>
          </Box>

          <List disablePadding>
            {activities.map((activity, index) => (
              <ListItem
                key={activity.id}
                sx={{
                  px: 0,
                  borderBottom: index < activities.length - 1 ? 1 : 0,
                  borderColor: 'divider',
                }}
              >
                <ListItemText
                  primary={activity.action}
                  secondary={
                    <Box component="span" sx={{ display: 'flex', gap: 1 }}>
                      <Typography component="span" variant="body2" color="text.secondary">
                        {formatRelativeTime(activity.timestamp)}
                      </Typography>
                      {activity.details && (
                        <>
                          <Typography component="span" variant="body2" color="text.secondary">
                            &bull;
                          </Typography>
                          <Typography component="span" variant="body2" color="text.secondary">
                            {activity.details}
                          </Typography>
                        </>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>

          {activities.length === 0 && (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
              No recent activity
            </Typography>
          )}
        </Paper>
      </Box>

      {/* Edit Profile Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCloseEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Profile</DialogTitle>
        <DialogContent>
          {editError && (
            <Alert severity="error" sx={{ mb: 2, mt: 1 }}>
              {editError}
            </Alert>
          )}
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label="Email"
              value={profile?.email || ''}
              disabled
              fullWidth
              helperText="Email cannot be changed"
            />
            <TextField
              label="Username"
              value={profile?.username || ''}
              disabled
              fullWidth
              helperText="Username cannot be changed"
            />
            <TextField
              label="First Name"
              value={editFormData.first_name}
              onChange={handleEditFormChange('first_name')}
              fullWidth
            />
            <TextField
              label="Last Name"
              value={editFormData.last_name}
              onChange={handleEditFormChange('last_name')}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditDialog} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSaveProfile} variant="contained" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
