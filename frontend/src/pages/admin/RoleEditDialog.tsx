import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import type { Role, Permission, RoleScope } from '../../types'
import { createRole, updateRole, fetchPermissions, groupPermissionsByResource } from '../../api/roles'

interface RoleEditDialogProps {
  open: boolean
  role: Role | null
  scope: RoleScope
  onClose: () => void
  onSave: (role: Role) => void
}

export default function RoleEditDialog({ open, role, scope, onClose, onSave }: RoleEditDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [permissionsLoading, setPermissionsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load permissions when dialog opens
  useEffect(() => {
    if (open) {
      setPermissionsLoading(true)
      fetchPermissions()
        .then(setPermissions)
        .catch(err => {
          console.error('Failed to fetch permissions:', err)
          setError('Failed to load permissions')
        })
        .finally(() => setPermissionsLoading(false))
    }
  }, [open])

  // Initialize form when role changes
  useEffect(() => {
    if (role) {
      setName(role.name)
      setDescription(role.description)
      setSelectedPermissions(new Set(role.permissions.map(p => p.id)))
    } else {
      setName('')
      setDescription('')
      setSelectedPermissions(new Set())
    }
    setError(null)
  }, [role, open])

  const groupedPermissions = useMemo(
    () => groupPermissionsByResource(permissions),
    [permissions]
  )

  const handlePermissionToggle = (permissionId: string) => {
    setSelectedPermissions(prev => {
      const next = new Set(prev)
      if (next.has(permissionId)) {
        next.delete(permissionId)
      } else {
        next.add(permissionId)
      }
      return next
    })
  }

  const handleResourceToggleAll = (resourceType: string, perms: Permission[]) => {
    const permIds = perms.map(p => p.id)
    const allSelected = permIds.every(id => selectedPermissions.has(id))

    setSelectedPermissions(prev => {
      const next = new Set(prev)
      if (allSelected) {
        permIds.forEach(id => next.delete(id))
      } else {
        permIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Role name is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      let savedRole: Role
      if (role) {
        savedRole = await updateRole(role.id, {
          name: name.trim(),
          description: description.trim(),
          permissionIds: Array.from(selectedPermissions),
        })
      } else {
        savedRole = await createRole({
          name: name.trim(),
          description: description.trim(),
          scope,
          permissionIds: Array.from(selectedPermissions),
        })
      }
      onSave(savedRole)
    } catch (err: any) {
      console.error('Failed to save role:', err)
      setError(err.message || 'Failed to save role')
    } finally {
      setSaving(false)
    }
  }

  const formatResourceName = (resourceType: string) => {
    return resourceType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const formatActionName = (action: string) => {
    return action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ')
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {role ? 'Edit Role' : `Create ${scope.charAt(0).toUpperCase() + scope.slice(1)} Role`}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label="Role Name"
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            required
            autoFocus
          />

          <TextField
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Permissions
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Select the permissions to grant to this role.
            </Typography>

            {permissionsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                {Array.from(groupedPermissions.entries()).map(([resourceType, perms]) => {
                  const selectedCount = perms.filter(p => selectedPermissions.has(p.id)).length
                  const allSelected = selectedCount === perms.length
                  const someSelected = selectedCount > 0 && selectedCount < perms.length

                  return (
                    <Accordion key={resourceType} disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', '&:not(:last-child)': { mb: 1 } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                          <Checkbox
                            checked={allSelected}
                            indeterminate={someSelected}
                            onChange={() => handleResourceToggleAll(resourceType, perms)}
                            onClick={e => e.stopPropagation()}
                            size="small"
                          />
                          <Typography variant="body2" fontWeight={500}>
                            {formatResourceName(resourceType)}
                          </Typography>
                          <Chip
                            label={`${selectedCount}/${perms.length}`}
                            size="small"
                            variant="outlined"
                            color={selectedCount > 0 ? 'primary' : 'default'}
                          />
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 0, pl: 6 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {perms.map(perm => (
                            <FormControlLabel
                              key={perm.id}
                              control={
                                <Checkbox
                                  checked={selectedPermissions.has(perm.id)}
                                  onChange={() => handlePermissionToggle(perm.id)}
                                  size="small"
                                />
                              }
                              label={
                                <Box>
                                  <Typography variant="body2">
                                    {formatActionName(perm.action)}
                                  </Typography>
                                  {perm.description && (
                                    <Typography variant="caption" color="text.secondary">
                                      {perm.description}
                                    </Typography>
                                  )}
                                </Box>
                              }
                            />
                          ))}
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  )
                })}
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving || permissionsLoading}
        >
          {saving ? 'Saving...' : role ? 'Save Changes' : 'Create Role'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
