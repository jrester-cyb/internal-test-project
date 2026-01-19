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
import type { Organization, OrganizationMember, User } from '../../types'
import {
  fetchOrganizationMembers,
  addOrganizationMember,
  removeOrganizationMember,
  updateOrganizationMember,
} from '../../api/organizations'
import { fetchUsers } from '../../api/users'

interface OrganizationMembersDialogProps {
  open: boolean
  organization: Organization | null
  onClose: () => void
}

type MemberRole = 'owner' | 'admin' | 'member'

const roleLabels: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
}

const roleColors: Record<MemberRole, 'warning' | 'primary' | 'default'> = {
  owner: 'warning',
  admin: 'primary',
  member: 'default',
}

export default function OrganizationMembersDialog({
  open,
  organization,
  onClose,
}: OrganizationMembersDialogProps) {
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState<MemberRole>('member')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!organization) return

    setLoading(true)
    setError(null)

    try {
      const [membersData, usersData] = await Promise.all([
        fetchOrganizationMembers(organization.id),
        fetchUsers(),
      ])
      setMembers(membersData)
      setUsers(usersData.results)
    } catch (err) {
      console.error('Failed to load data:', err)
      setError('Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [organization])

  useEffect(() => {
    if (open && organization) {
      loadData()
      setSelectedUserId('')
      setSelectedRole('member')
    }
  }, [open, organization, loadData])

  const handleAddMember = async () => {
    if (!organization || !selectedUserId) return

    setSaving(true)
    setError(null)

    try {
      const newMember = await addOrganizationMember(
        organization.id,
        selectedUserId,
        selectedRole
      )
      setMembers((prev) => [...prev, newMember])
      setSelectedUserId('')
      setSelectedRole('member')
    } catch (err: any) {
      console.error('Failed to add member:', err)
      setError(err.message || 'Failed to add member')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!organization) return

    setSaving(true)
    setError(null)

    try {
      await removeOrganizationMember(organization.id, memberId)
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    } catch (err: any) {
      console.error('Failed to remove member:', err)
      setError(err.message || 'Failed to remove member')
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (memberId: string, newRole: MemberRole) => {
    if (!organization) return

    setSaving(true)
    setError(null)

    try {
      const updatedMember = await updateOrganizationMember(
        organization.id,
        memberId,
        newRole
      )
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

  // Filter out already added users
  const memberUserIds = new Set(members.map((m) => m.user))
  const availableUsers = users.filter((u) => !memberUserIds.has(u.id))

  const getInitials = (username: string, email: string) => {
    if (username && username.trim()) {
      const parts = username.trim().split(' ')
      return parts
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    return email[0].toUpperCase()
  }

  if (!organization) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Organization Members - {organization.name}</DialogTitle>
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
                    No members in this organization.
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {members.map((member) => (
                      <ListItem key={member.id} sx={{ pl: 0 }}>
                        <ListItemAvatar>
                          <Avatar sx={{ width: 32, height: 32, fontSize: '0.875rem' }}>
                            {getInitials(member.username, member.email)}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {member.username || member.email}
                              <Chip
                                label={roleLabels[member.role]}
                                size="small"
                                color={roleColors[member.role]}
                                variant="outlined"
                              />
                            </Box>
                          }
                          secondary={member.username ? member.email : undefined}
                        />
                        <ListItemSecondaryAction>
                          <FormControl size="small" sx={{ minWidth: 100, mr: 1 }}>
                            <Select
                              value={member.role}
                              onChange={(e) =>
                                handleRoleChange(member.id, e.target.value as MemberRole)
                              }
                              disabled={saving}
                              size="small"
                            >
                              <MenuItem value="member">Member</MenuItem>
                              <MenuItem value="admin">Admin</MenuItem>
                              <MenuItem value="owner">Owner</MenuItem>
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
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Select User</InputLabel>
                    <Select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      label="Select User"
                      disabled={saving || availableUsers.length === 0}
                    >
                      {availableUsers.map((user) => (
                        <MenuItem key={user.id} value={user.id}>
                          {user.fullName || user.email}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Role</InputLabel>
                    <Select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as MemberRole)}
                      label="Role"
                      disabled={saving}
                    >
                      <MenuItem value="member">Member</MenuItem>
                      <MenuItem value="admin">Admin</MenuItem>
                      <MenuItem value="owner">Owner</MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    onClick={handleAddMember}
                    disabled={!selectedUserId || saving}
                    startIcon={<AddIcon />}
                  >
                    Add
                  </Button>
                </Box>
                {availableUsers.length === 0 && users.length > 0 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1, display: 'block' }}
                  >
                    All users are already members of this organization.
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
