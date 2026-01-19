import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material'
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material'
import type { Group, Role, InstanceGroupMember } from '../../types'
import { fetchInstanceRoles } from '../../api/roles'
import { fetchInstanceGroupMembers, assignInstanceGroupRole, removeInstanceGroupRole } from '../../api/groups'

interface GroupRolesDialogProps {
  open: boolean
  group: Group | null
  onClose: () => void
}

export default function GroupRolesDialog({ open, group, onClose }: GroupRolesDialogProps) {
  const [instanceRoles, setInstanceRoles] = useState<Role[]>([])
  const [groupInstanceRoles, setGroupInstanceRoles] = useState<InstanceGroupMember[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!group) return

    setLoading(true)
    setError(null)

    try {
      const [roles, members] = await Promise.all([
        fetchInstanceRoles(),
        fetchInstanceGroupMembers(group.id),
      ])
      setInstanceRoles(roles)
      setGroupInstanceRoles(members)
    } catch (err) {
      console.error('Failed to load data:', err)
      setError('Failed to load roles')
    } finally {
      setLoading(false)
    }
  }, [group])

  useEffect(() => {
    if (open && group) {
      loadData()
      setSelectedRoleId('')
    }
  }, [open, group, loadData])

  const handleAddRole = async () => {
    if (!group || !selectedRoleId) return

    setSaving(true)
    setError(null)

    try {
      const newMember = await assignInstanceGroupRole(group.id, selectedRoleId)
      setGroupInstanceRoles(prev => [...prev, newMember])
      setSelectedRoleId('')
    } catch (err: any) {
      console.error('Failed to assign role:', err)
      setError(err.message || 'Failed to assign role')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveRole = async (memberId: string) => {
    setSaving(true)
    setError(null)

    try {
      await removeInstanceGroupRole(memberId)
      setGroupInstanceRoles(prev => prev.filter(m => m.id !== memberId))
    } catch (err: any) {
      console.error('Failed to remove role:', err)
      setError(err.message || 'Failed to remove role')
    } finally {
      setSaving(false)
    }
  }

  // Filter out already assigned roles
  const assignedRoleIds = new Set(groupInstanceRoles.map(m => m.role))
  const availableRoles = instanceRoles.filter(r => !assignedRoleIds.has(r.id))

  if (!group) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Group Roles - {group.name}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : (
            <>
              {/* Current Roles */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Instance Roles
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Roles that grant system-wide permissions to all users in this group.
                </Typography>

                {groupInstanceRoles.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No instance roles assigned.
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {groupInstanceRoles.map(member => (
                      <ListItem key={member.id} sx={{ pl: 0 }}>
                        <ListItemText
                          primary={
                            <Typography variant="body2" fontWeight={500}>
                              {member.roleName}
                            </Typography>
                          }
                          secondary={`Assigned ${new Date(member.grantedAt).toLocaleDateString()}`}
                        />
                        <ListItemSecondaryAction>
                          <IconButton
                            edge="end"
                            size="small"
                            onClick={() => handleRemoveRole(member.id)}
                            disabled={saving}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>

              <Divider />

              {/* Add Role */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Add Role
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Select Role</InputLabel>
                    <Select
                      value={selectedRoleId}
                      onChange={e => setSelectedRoleId(e.target.value)}
                      label="Select Role"
                      disabled={saving || availableRoles.length === 0}
                    >
                      {availableRoles.map(role => (
                        <MenuItem key={role.id} value={role.id}>
                          {role.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    onClick={handleAddRole}
                    disabled={!selectedRoleId || saving}
                    startIcon={<AddIcon />}
                  >
                    Add
                  </Button>
                </Box>
                {availableRoles.length === 0 && instanceRoles.length > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    All available roles have been assigned.
                  </Typography>
                )}
              </Box>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
