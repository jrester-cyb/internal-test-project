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
  ListItemAvatar,
  ListItemSecondaryAction,
  Avatar,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Divider,
  Chip,
} from '@mui/material'
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material'
import type { Workspace, WorkspaceMember, OrganizationMember, Role } from '../../types'
import {
  fetchWorkspaceMembers,
  addWorkspaceMember,
  updateWorkspaceMember,
  removeWorkspaceMember,
  fetchWorkspaceRoles,
} from '../../api/workspaces'
import { fetchOrganizationMembers } from '../../api/organizations'

interface WorkspaceMembersDialogProps {
  open: boolean
  workspace: Workspace | null
  organizationId: string
  onClose: () => void
}

export default function WorkspaceMembersDialog({
  open,
  workspace,
  organizationId,
  onClose,
}: WorkspaceMembersDialogProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [orgMembers, setOrgMembers] = useState<OrganizationMember[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!workspace) return

    setLoading(true)
    setError(null)

    try {
      const [membersData, orgMembersData, rolesData] = await Promise.all([
        fetchWorkspaceMembers(workspace.id),
        fetchOrganizationMembers(organizationId),
        fetchWorkspaceRoles(),
      ])
      setMembers(membersData)
      setOrgMembers(orgMembersData)
      setRoles(rolesData)

      // Set default role if available
      if (rolesData.length > 0 && !selectedRoleId) {
        setSelectedRoleId(rolesData[0].id)
      }
    } catch (err) {
      console.error('Failed to load data:', err)
      setError('Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [workspace, organizationId, selectedRoleId])

  useEffect(() => {
    if (open && workspace) {
      loadData()
      setSelectedUserId('')
    }
  }, [open, workspace, loadData])

  const handleAddMember = async () => {
    if (!workspace || !selectedUserId || !selectedRoleId) return

    setSaving(true)
    setError(null)

    try {
      const newMember = await addWorkspaceMember({
        workspace: workspace.id,
        user: selectedUserId,
        role: selectedRoleId,
      })
      setMembers((prev) => [...prev, newMember])
      setSelectedUserId('')
    } catch (err: any) {
      console.error('Failed to add member:', err)
      setError(err.message || 'Failed to add member')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!workspace) return

    setSaving(true)
    setError(null)

    try {
      await removeWorkspaceMember(memberId)
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    } catch (err: any) {
      console.error('Failed to remove member:', err)
      setError(err.message || 'Failed to remove member')
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (memberId: string, newRoleId: string) => {
    if (!workspace) return

    setSaving(true)
    setError(null)

    try {
      const updatedMember = await updateWorkspaceMember(memberId, newRoleId)
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? updatedMember : m))
      )
    } catch (err: any) {
      console.error('Failed to update member role:', err)
      setError(err.message || 'Failed to update member role')
    } finally {
      setSaving(false)
    }
  }

  // Filter out users who are already workspace members
  // Only show organization members who can be added to workspace
  const memberUserIds = new Set(members.map((m) => m.user))
  const availableUsers = orgMembers.filter((om) => !memberUserIds.has(om.user))

  const getInitials = (name: string, email: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(' ')
      return parts
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    return email[0].toUpperCase()
  }

  if (!workspace) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Workspace Members - {workspace.name}</DialogTitle>
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
              {/* Current Members */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Members ({members.length})
                </Typography>

                {members.length === 0 ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ py: 2 }}
                  >
                    No members in this workspace.
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {members.map((member) => (
                      <ListItem key={member.id} sx={{ pl: 0 }}>
                        <ListItemAvatar>
                          <Avatar sx={{ width: 32, height: 32, fontSize: '0.875rem' }}>
                            {getInitials(member.userName, member.userEmail)}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {member.userName || member.userEmail}
                              <Chip
                                label={member.roleName}
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            </Box>
                          }
                          secondary={member.userName ? member.userEmail : undefined}
                        />
                        <ListItemSecondaryAction>
                          <FormControl size="small" sx={{ minWidth: 120, mr: 1 }}>
                            <Select
                              value={member.role}
                              onChange={(e) =>
                                handleRoleChange(member.id, e.target.value)
                              }
                              disabled={saving}
                              size="small"
                            >
                              {roles.map((role) => (
                                <MenuItem key={role.id} value={role.id}>
                                  {role.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <IconButton
                            edge="end"
                            size="small"
                            onClick={() => handleRemoveMember(member.id)}
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

              {/* Add Member */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Add Member
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  Only organization members can be added to workspaces.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Select User</InputLabel>
                    <Select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      label="Select User"
                      disabled={saving || availableUsers.length === 0}
                    >
                      {availableUsers.map((orgMember) => (
                        <MenuItem key={orgMember.user} value={orgMember.user}>
                          {orgMember.username || orgMember.email}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Role</InputLabel>
                    <Select
                      value={selectedRoleId}
                      onChange={(e) => setSelectedRoleId(e.target.value)}
                      label="Role"
                      disabled={saving || roles.length === 0}
                    >
                      {roles.map((role) => (
                        <MenuItem key={role.id} value={role.id}>
                          {role.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    onClick={handleAddMember}
                    disabled={!selectedUserId || !selectedRoleId || saving}
                    startIcon={<AddIcon />}
                  >
                    Add
                  </Button>
                </Box>
                {availableUsers.length === 0 && orgMembers.length > 0 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1, display: 'block' }}
                  >
                    All organization members are already in this workspace.
                  </Typography>
                )}
                {orgMembers.length === 0 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1, display: 'block' }}
                  >
                    No organization members available. Add members to the organization first.
                  </Typography>
                )}
              </Box>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
