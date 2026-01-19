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
} from '@mui/material'
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material'
import type { Group, GroupMembership, User } from '../../types'
import { fetchGroupMemberships, addUserToGroup, removeUserFromGroup } from '../../api/groups'
import { fetchUsers } from '../../api/users'

interface GroupMembersDialogProps {
  open: boolean
  group: Group | null
  onClose: () => void
  onMemberCountChange: (groupId: string, count: number) => void
}

export default function GroupMembersDialog({ open, group, onClose, onMemberCountChange }: GroupMembersDialogProps) {
  const [members, setMembers] = useState<GroupMembership[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!group) return

    setLoading(true)
    setError(null)

    try {
      const [membersData, usersData] = await Promise.all([
        fetchGroupMemberships(group.id),
        fetchUsers(),
      ])
      setMembers(membersData)
      setUsers(usersData)
    } catch (err) {
      console.error('Failed to load data:', err)
      setError('Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [group])

  useEffect(() => {
    if (open && group) {
      loadData()
      setSelectedUserId('')
    }
  }, [open, group, loadData])

  const handleAddMember = async () => {
    if (!group || !selectedUserId) return

    setSaving(true)
    setError(null)

    try {
      const newMember = await addUserToGroup(group.id, selectedUserId)
      setMembers(prev => [...prev, newMember])
      setSelectedUserId('')
      onMemberCountChange(group.id, members.length + 1)
    } catch (err: any) {
      console.error('Failed to add member:', err)
      setError(err.message || 'Failed to add member')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveMember = async (membershipId: string) => {
    if (!group) return

    setSaving(true)
    setError(null)

    try {
      await removeUserFromGroup(membershipId)
      setMembers(prev => prev.filter(m => m.id !== membershipId))
      onMemberCountChange(group.id, members.length - 1)
    } catch (err: any) {
      console.error('Failed to remove member:', err)
      setError(err.message || 'Failed to remove member')
    } finally {
      setSaving(false)
    }
  }

  // Filter out already added users
  const memberUserIds = new Set(members.map(m => m.user))
  const availableUsers = users.filter(u => !memberUserIds.has(u.id))

  const getInitials = (name: string, email: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(' ')
      return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2)
    }
    return email[0].toUpperCase()
  }

  if (!group) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Group Members - {group.name}
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
              {/* Current Members */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Members ({members.length})
                </Typography>

                {members.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No members in this group.
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {members.map(member => (
                      <ListItem key={member.id} sx={{ pl: 0 }}>
                        <ListItemAvatar>
                          <Avatar sx={{ width: 32, height: 32, fontSize: '0.875rem' }}>
                            {getInitials(member.userName, member.userEmail)}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={member.userName || member.userEmail}
                          secondary={member.userName ? member.userEmail : undefined}
                        />
                        <ListItemSecondaryAction>
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
                      onChange={e => setSelectedUserId(e.target.value)}
                      label="Select User"
                      disabled={saving || availableUsers.length === 0}
                    >
                      {availableUsers.map(user => (
                        <MenuItem key={user.id} value={user.id}>
                          {user.fullName || user.email}
                        </MenuItem>
                      ))}
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
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    All users are already members of this group.
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
