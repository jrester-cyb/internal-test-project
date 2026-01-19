import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Box,
  Typography,
  Button,
  IconButton,
  Skeleton,
  Tooltip,
  Avatar,
  TextField,
  InputAdornment,
  Link,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
  Security as RolesIcon,
} from '@mui/icons-material'
import { Link as RouterLink } from 'react-router-dom'
import type { User } from '../../types'
import { fetchUsers, deleteUser } from '../../api/users'
import UserEditDialog from './UserEditDialog'
import UserRolesDialog from './UserRolesDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import InfiniteLoaderTable, { type TableColumn } from '../../components/InfiniteLoaderTable'

const PAGE_SIZE = 50

// Custom skeleton placeholder for loading rows
const RowLoadingPlaceholder = (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, px: 2 }}>
    <Skeleton variant="circular" width={32} height={32} />
    <Skeleton variant="text" width="40%" height={20} />
  </Box>
)

export default function UsersPage() {
  const [users, setUsers] = useState<Map<number, User>>(new Map())
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<User | null>(null)
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false)
  const [rolesUser, setRolesUser] = useState<User | null>(null)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset users when search changes
  useEffect(() => {
    setUsers(new Map())
    setTotalCount(0)
    setLoading(true)
  }, [debouncedSearch])

  const loadUsers = useCallback(async (startIndex: number, endIndex: number) => {
    setLoading(true)
    try {
      const data = await fetchUsers({
        offset: startIndex,
        limit: endIndex - startIndex + 1,
        search: debouncedSearch || undefined,
      })
      setTotalCount(data.count)
      setUsers(prev => {
        const next = new Map(prev)
        data.results.forEach((user, i) => {
          next.set(startIndex + i, user)
        })
        return next
      })
    } catch (err) {
      console.error('Failed to fetch users:', err)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch])

  // Initial load
  useEffect(() => {
    loadUsers(0, PAGE_SIZE - 1)
  }, [loadUsers])

  const handleCreateUser = () => {
    setEditingUser(null)
    setEditDialogOpen(true)
  }

  const handleEditUser = (user: User) => {
    setEditingUser(user)
    setEditDialogOpen(true)
  }

  const handleDeleteClick = (user: User) => {
    setDeletingUser(user)
    setDeleteDialogOpen(true)
  }

  const handleManageRoles = (user: User) => {
    setRolesUser(user)
    setRolesDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingUser) return
    try {
      await deleteUser(deletingUser.id)
      // Remove from map and update indices
      setUsers(prev => {
        const next = new Map<number, User>()
        let shift = 0
        for (const [idx, user] of prev) {
          if (user.id === deletingUser.id) {
            shift = 1
          } else {
            next.set(idx - shift, user)
          }
        }
        return next
      })
      setTotalCount(prev => prev - 1)
    } catch (err) {
      console.error('Failed to delete user:', err)
    } finally {
      setDeleteDialogOpen(false)
      setDeletingUser(null)
    }
  }

  const handleDialogClose = () => {
    setEditDialogOpen(false)
    setEditingUser(null)
  }

  const handleUserSaved = (savedUser: User) => {
    if (editingUser) {
      // Update existing user in map
      setUsers(prev => {
        const next = new Map(prev)
        for (const [idx, user] of prev) {
          if (user.id === savedUser.id) {
            next.set(idx, savedUser)
            break
          }
        }
        return next
      })
    } else {
      // Add new user at the beginning and shift indices
      setUsers(prev => {
        const next = new Map<number, User>()
        next.set(0, savedUser)
        for (const [idx, user] of prev) {
          next.set(idx + 1, user)
        }
        return next
      })
      setTotalCount(prev => prev + 1)
    }
    handleDialogClose()
  }

  const getInitials = useCallback((user: User) => {
    const first = user.firstName?.[0] || ''
    const last = user.lastName?.[0] || ''
    return (first + last).toUpperCase() || user.email[0].toUpperCase()
  }, [])

  // Define columns for the table
  const columns: TableColumn<User>[] = useMemo(() => [
    {
      key: 'user',
      header: 'User',
      width: 250,
      resizable: true,
      render: (user) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Avatar
            src={user.avatar}
            sx={{ width: 32, height: 32, fontSize: '0.875rem', flexShrink: 0 }}
          >
            {getInitials(user)}
          </Avatar>
          <Link
            component={RouterLink}
            to={`${user.id}`}
            underline="hover"
            sx={{
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user.fullName || user.email}
          </Link>
        </Box>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      width: 250,
      resizable: true,
      render: (user) => (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user.email}
        </Typography>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 80,
      flex: 0,
      headerSx: { justifyContent: 'center' },
      cellSx: { justifyContent: 'center' },
      render: (user) => (
        <Tooltip title={user.isActive ? 'Active' : 'Inactive'}>
          {user.isActive ? (
            <ActiveIcon fontSize="small" color="success" />
          ) : (
            <InactiveIcon fontSize="small" color="error" />
          )}
        </Tooltip>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      width: 120,
      render: (user) => (
        <Typography variant="body2" color="text.secondary">
          {user.lastLogin
            ? new Date(user.lastLogin).toLocaleDateString()
            : 'Never'}
        </Typography>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      flex: 0,
      headerSx: { justifyContent: 'flex-end' },
      cellSx: { justifyContent: 'flex-end' },
      render: (user) => (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
          <Tooltip title="Manage roles">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                handleManageRoles(user)
              }}
            >
              <RolesIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit user">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                handleEditUser(user)
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete user">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteClick(user)
              }}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ], [getInitials])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h1" fontWeight={600}>
          Users
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Manage user accounts across the instance
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
        <TextField
          size="small"
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
          sx={{ width: 300 }}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateUser}
          size="small"
        >
          Create User
        </Button>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <InfiniteLoaderTable<User>
          items={users}
          totalCount={totalCount}
          getRowKey={(user) => user.id}
          columns={columns}
          onLoadRange={loadUsers}
          isLoading={loading}
          estimatedRowHeight={52}
          emptyMessage={searchQuery ? 'No users match your search' : 'No users found'}
          emptyDescription={searchQuery ? undefined : 'Create a user to get started'}
          loadingPlaceholder={RowLoadingPlaceholder}
          headerHeight={44}
        />
      </Box>

      <UserEditDialog
        open={editDialogOpen}
        user={editingUser}
        onClose={handleDialogClose}
        onSave={handleUserSaved}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete User"
        message={`Are you sure you want to delete the user "${deletingUser?.email}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setDeletingUser(null)
        }}
      />

      <UserRolesDialog
        open={rolesDialogOpen}
        user={rolesUser}
        onClose={() => {
          setRolesDialogOpen(false)
          setRolesUser(null)
        }}
      />
    </Box>
  )
}
