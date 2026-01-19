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
  TextField,
  InputAdornment,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  People as MembersIcon,
  Security as RolesIcon,
} from '@mui/icons-material'
import type { Group } from '../../types'
import { fetchGroups, deleteGroup } from '../../api/groups'
import GroupEditDialog from './GroupEditDialog'
import GroupMembersDialog from './GroupMembersDialog'
import GroupRolesDialog from './GroupRolesDialog'
import ConfirmDialog from '../../components/ConfirmDialog'

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null)
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [membersGroup, setMembersGroup] = useState<Group | null>(null)
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false)
  const [rolesGroup, setRolesGroup] = useState<Group | null>(null)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchGroups()
      setGroups(data)
    } catch (err) {
      console.error('Failed to fetch groups:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  const handleCreateGroup = () => {
    setEditingGroup(null)
    setEditDialogOpen(true)
  }

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group)
    setEditDialogOpen(true)
  }

  const handleDeleteClick = (group: Group) => {
    setDeletingGroup(group)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingGroup) return
    try {
      await deleteGroup(deletingGroup.id)
      setGroups(prev => prev.filter(g => g.id !== deletingGroup.id))
    } catch (err) {
      console.error('Failed to delete group:', err)
    } finally {
      setDeleteDialogOpen(false)
      setDeletingGroup(null)
    }
  }

  const handleDialogClose = () => {
    setEditDialogOpen(false)
    setEditingGroup(null)
  }

  const handleGroupSaved = (savedGroup: Group) => {
    if (editingGroup) {
      setGroups(prev => prev.map(g => (g.id === savedGroup.id ? savedGroup : g)))
    } else {
      setGroups(prev => [...prev, savedGroup])
    }
    handleDialogClose()
  }

  const handleManageMembers = (group: Group) => {
    setMembersGroup(group)
    setMembersDialogOpen(true)
  }

  const handleManageRoles = (group: Group) => {
    setRolesGroup(group)
    setRolesDialogOpen(true)
  }

  // Filter groups by search query
  const filteredGroups = groups.filter(group => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      group.name.toLowerCase().includes(query) ||
      group.description.toLowerCase().includes(query)
    )
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h1" fontWeight={600}>
          Groups
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Manage user groups for bulk permission assignment
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
        <TextField
          size="small"
          placeholder="Search groups..."
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
          onClick={handleCreateGroup}
          size="small"
        >
          Create Group
        </Button>
      </Box>

      <TableContainer sx={{ flexGrow: 1 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="center">Members</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton width={150} /></TableCell>
                  <TableCell><Skeleton width={250} /></TableCell>
                  <TableCell align="center"><Skeleton width={40} /></TableCell>
                  <TableCell><Skeleton width={100} /></TableCell>
                  <TableCell align="right"><Skeleton width={120} /></TableCell>
                </TableRow>
              ))
            ) : filteredGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    {searchQuery ? 'No groups match your search.' : 'No groups found. Create one to get started.'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredGroups.map(group => (
                <TableRow key={group.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {group.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
                      {group.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={group.memberCount}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(group.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Manage members">
                      <IconButton
                        size="small"
                        onClick={() => handleManageMembers(group)}
                      >
                        <MembersIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Manage roles">
                      <IconButton
                        size="small"
                        onClick={() => handleManageRoles(group)}
                      >
                        <RolesIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit group">
                      <IconButton
                        size="small"
                        onClick={() => handleEditGroup(group)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete group">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteClick(group)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <GroupEditDialog
        open={editDialogOpen}
        group={editingGroup}
        onClose={handleDialogClose}
        onSave={handleGroupSaved}
      />

      <GroupMembersDialog
        open={membersDialogOpen}
        group={membersGroup}
        onClose={() => {
          setMembersDialogOpen(false)
          setMembersGroup(null)
        }}
        onMemberCountChange={(groupId, count) => {
          setGroups(prev => prev.map(g =>
            g.id === groupId ? { ...g, memberCount: count } : g
          ))
        }}
      />

      <GroupRolesDialog
        open={rolesDialogOpen}
        group={rolesGroup}
        onClose={() => {
          setRolesDialogOpen(false)
          setRolesGroup(null)
        }}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Group"
        message={`Are you sure you want to delete the group "${deletingGroup?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setDeletingGroup(null)
        }}
      />
    </Box>
  )
}
