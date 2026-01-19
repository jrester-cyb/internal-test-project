import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Skeleton,
  Tooltip,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Lock as LockIcon,
} from '@mui/icons-material'
import { useParams } from 'react-router-dom'
import type { Role, RoleScope } from '../../types'
import { fetchRolesByScope, deleteRole } from '../../api/roles'
import RoleEditDialog from './RoleEditDialog'
import ConfirmDialog from '../../components/ConfirmDialog'

const scopeDescriptions: Record<RoleScope, string> = {
  instance: 'Instance roles apply across the entire application and are typically used for system administrators.',
  organization: 'Organization roles define what users can do within an organization, such as managing members or settings.',
  workspace: 'Workspace roles control access to specific workspaces, including assets, files, and attributes.',
}

export default function RolesList() {
  const { scope } = useParams<{ scope: RoleScope }>()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingRole, setDeletingRole] = useState<Role | null>(null)

  const loadRoles = useCallback(async () => {
    if (!scope) return
    setLoading(true)
    try {
      const data = await fetchRolesByScope(scope)
      setRoles(data)
    } catch (err) {
      console.error('Failed to fetch roles:', err)
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    loadRoles()
  }, [loadRoles])

  const handleCreateRole = () => {
    setEditingRole(null)
    setEditDialogOpen(true)
  }

  const handleEditRole = (role: Role) => {
    setEditingRole(role)
    setEditDialogOpen(true)
  }

  const handleDeleteClick = (role: Role) => {
    setDeletingRole(role)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingRole) return
    try {
      await deleteRole(deletingRole.id)
      setRoles(prev => prev.filter(r => r.id !== deletingRole.id))
    } catch (err) {
      console.error('Failed to delete role:', err)
    } finally {
      setDeleteDialogOpen(false)
      setDeletingRole(null)
    }
  }

  const handleDialogClose = () => {
    setEditDialogOpen(false)
    setEditingRole(null)
  }

  const handleRoleSaved = (savedRole: Role) => {
    if (editingRole) {
      setRoles(prev => prev.map(r => (r.id === savedRole.id ? savedRole : r)))
    } else {
      setRoles(prev => [...prev, savedRole])
    }
    handleDialogClose()
  }

  if (!scope) return null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="body2" color="text.secondary">
            {scopeDescriptions[scope]}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateRole}
          size="small"
        >
          Create Role
        </Button>
      </Box>

      <TableContainer sx={{ flexGrow: 1 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="center">Permissions</TableCell>
              <TableCell align="center">Type</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton width={120} /></TableCell>
                  <TableCell><Skeleton width={200} /></TableCell>
                  <TableCell align="center"><Skeleton width={40} /></TableCell>
                  <TableCell align="center"><Skeleton width={60} /></TableCell>
                  <TableCell align="right"><Skeleton width={80} /></TableCell>
                </TableRow>
              ))
            ) : roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No {scope} roles found. Create one to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              roles.map(role => (
                <TableRow key={role.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {role.isSystemRole && (
                        <Tooltip title="System role (cannot be modified)">
                          <LockIcon fontSize="small" color="disabled" />
                        </Tooltip>
                      )}
                      <Typography variant="body2" fontWeight={500}>
                        {role.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
                      {role.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={role.permissions.length}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={role.isSystemRole ? 'System' : 'Custom'}
                      size="small"
                      color={role.isSystemRole ? 'default' : 'primary'}
                      variant={role.isSystemRole ? 'outlined' : 'filled'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={role.isSystemRole ? 'System roles cannot be edited' : 'Edit role'}>
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => handleEditRole(role)}
                          disabled={role.isSystemRole}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={role.isSystemRole ? 'System roles cannot be deleted' : 'Delete role'}>
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteClick(role)}
                          disabled={role.isSystemRole}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <RoleEditDialog
        open={editDialogOpen}
        role={editingRole}
        scope={scope}
        onClose={handleDialogClose}
        onSave={handleRoleSaved}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Role"
        message={`Are you sure you want to delete the role "${deletingRole?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setDeletingRole(null)
        }}
      />
    </Box>
  )
}
