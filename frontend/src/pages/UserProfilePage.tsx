import { useState, useEffect } from 'react'
import {
  Typography,
  Paper,
  Box,
  Avatar,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
  Chip,
  Skeleton,
} from '@mui/material'
import {
  Security as SecurityIcon,
  Edit as EditIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
} from '@mui/icons-material'
import { Link, useParams } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { prefetchSessions } from '../utils/preload'
import type { User } from '../types'
import { fetchUser } from '../api/users'
import UserEditDialog from './admin/UserEditDialog'
import UserRolesDialog from './admin/UserRolesDialog'

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const { user: currentUser, updateUser: updateCurrentUser } = useUser()

  // If no userId in URL, we're viewing our own profile
  const isOwnProfile = !userId

  // State for fetched user (when viewing another user)
  const [fetchedUser, setFetchedUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!isOwnProfile)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false)

  // The user to display - either current user or fetched user
  const user = isOwnProfile ? currentUser : fetchedUser

  // Fetch user when viewing another user's profile
  useEffect(() => {
    if (isOwnProfile || !userId) return

    const loadUser = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchUser(userId)
        setFetchedUser(data)
      } catch (err) {
        console.error('Failed to fetch user:', err)
        setError('Failed to load user')
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [isOwnProfile, userId])

  const handleUserSaved = (savedUser: User) => {
    if (isOwnProfile) {
      updateCurrentUser({
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
      })
    } else {
      setFetchedUser(savedUser)
    }
    setEditDialogOpen(false)
  }

  const getInitials = (u: User | typeof currentUser) => {
    const first = u.firstName?.[0] || ''
    const last = u.lastName?.[0] || ''
    return (first + last).toUpperCase() || (u.email?.[0] || 'U').toUpperCase()
  }

  const getDisplayName = (u: User | typeof currentUser) => {
    return u.firstName || u.lastName
      ? `${u.firstName || ''} ${u.lastName || ''}`.trim()
      : u.email || 'User'
  }

  // Loading state
  if (loading) {
    return (
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        <Box sx={{ display: 'flex', gap: 3, maxWidth: 1200, mx: 'auto' }}>
          <Skeleton variant="rectangular" width={300} height={300} sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" sx={{ flex: 1, borderRadius: 1 }} height={300} />
        </Box>
      </Box>
    )
  }

  // Error state
  if (error || !user) {
    return (
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        <Alert severity="error">{error || 'User not found'}</Alert>
      </Box>
    )
  }

  const displayName = getDisplayName(user)

  // Convert currentUser to User type for the edit dialog
  const userForDialog: User | null = isOwnProfile
    ? {
        id: currentUser.id,
        email: currentUser.email || '',
        firstName: currentUser.firstName || '',
        lastName: currentUser.lastName || '',
        fullName: getDisplayName(currentUser),
        isActive: true,
        phoneNumber: '',
        dateJoined: '',
        lastLogin: null,
      }
    : fetchedUser

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
      <Box sx={{ display: 'flex', gap: 3, maxWidth: 1200, mx: 'auto' }}>
        {/* Left Column - Profile Info */}
        <Paper sx={{ width: 300, flexShrink: 0, p: 3, alignSelf: 'flex-start' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Avatar
              src={'avatar' in user ? user.avatar : undefined}
              sx={{
                width: 100,
                height: 100,
                mb: 2,
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'primary.light' : 'primary.main',
                color: 'primary.contrastText',
                fontSize: 40,
              }}
            >
              {getInitials(user)}
            </Avatar>
            <Typography variant="h6" align="center">
              {displayName}
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              {user.email}
            </Typography>
            {/* Show status chip */}
            {'isActive' in user && (
              <Box sx={{ mt: 1 }}>
                <Chip
                  icon={user.isActive ? <ActiveIcon /> : <InactiveIcon />}
                  label={user.isActive ? 'Active' : 'Inactive'}
                  color={user.isActive ? 'success' : 'error'}
                  size="small"
                  variant="outlined"
                />
              </Box>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          <List disablePadding>
            <ListItem
              component="button"
              onClick={() => setEditDialogOpen(true)}
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
              to={isOwnProfile ? '/profile/security' : 'security'}
              onMouseEnter={() => prefetchSessions(user.id)}
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
                <SecurityIcon />
              </ListItemIcon>
              <ListItemText primary="Security Settings" />
            </ListItem>
            {!isOwnProfile && (
              <ListItem
                component="button"
                onClick={() => setRolesDialogOpen(true)}
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
                <ListItemText primary="Manage Roles" />
              </ListItem>
            )}
          </List>
        </Paper>

        {/* Right Column - Account Info */}
        <Paper sx={{ flex: 1, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 3 }}>
            Account Information
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                First Name
              </Typography>
              <Typography variant="body1">
                {user.firstName || '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Last Name
              </Typography>
              <Typography variant="body1">
                {user.lastName || '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Email
              </Typography>
              <Typography variant="body1">
                {user.email}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Phone Number
              </Typography>
              <Typography variant="body1">
                {'phoneNumber' in user ? user.phoneNumber || '-' : '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Last Login
              </Typography>
              <Typography variant="body1">
                {'lastLogin' in user && user.lastLogin
                  ? new Date(user.lastLogin).toLocaleString()
                  : 'Never'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Date Joined
              </Typography>
              <Typography variant="body1">
                {'dateJoined' in user && user.dateJoined
                  ? new Date(user.dateJoined).toLocaleString()
                  : '-'}
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>

      {/* Edit dialog */}
      {userForDialog && (
        <UserEditDialog
          open={editDialogOpen}
          user={userForDialog}
          onClose={() => setEditDialogOpen(false)}
          onSave={handleUserSaved}
        />
      )}

      {/* Roles dialog (only for admin viewing other users) */}
      {!isOwnProfile && fetchedUser && (
        <UserRolesDialog
          open={rolesDialogOpen}
          user={fetchedUser}
          onClose={() => setRolesDialogOpen(false)}
        />
      )}
    </Box>
  )
}
