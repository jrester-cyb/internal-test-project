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
} from '@mui/icons-material'
import type { Organization } from '../../types'
import { fetchOrganizations, deleteOrganization } from '../../api/organizations'
import OrganizationEditDialog from './OrganizationEditDialog'
import OrganizationMembersDialog from './OrganizationMembersDialog'
import ConfirmDialog from '../../components/ConfirmDialog'

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingOrganization, setDeletingOrganization] = useState<Organization | null>(null)
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [membersOrganization, setMembersOrganization] = useState<Organization | null>(null)

  const loadOrganizations = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchOrganizations()
      setOrganizations(data.results)
    } catch (err) {
      console.error('Failed to fetch organizations:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrganizations()
  }, [loadOrganizations])

  const handleCreateOrganization = () => {
    setEditingOrganization(null)
    setEditDialogOpen(true)
  }

  const handleEditOrganization = (organization: Organization) => {
    setEditingOrganization(organization)
    setEditDialogOpen(true)
  }

  const handleDeleteClick = (organization: Organization) => {
    setDeletingOrganization(organization)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingOrganization) return
    try {
      await deleteOrganization(deletingOrganization.id)
      setOrganizations((prev) => prev.filter((o) => o.id !== deletingOrganization.id))
    } catch (err) {
      console.error('Failed to delete organization:', err)
    } finally {
      setDeleteDialogOpen(false)
      setDeletingOrganization(null)
    }
  }

  const handleDialogClose = () => {
    setEditDialogOpen(false)
    setEditingOrganization(null)
  }

  const handleOrganizationSaved = (savedOrganization: Organization) => {
    if (editingOrganization) {
      setOrganizations((prev) =>
        prev.map((o) => (o.id === savedOrganization.id ? savedOrganization : o))
      )
    } else {
      setOrganizations((prev) => [...prev, savedOrganization])
    }
    handleDialogClose()
  }

  const handleManageMembers = (organization: Organization) => {
    setMembersOrganization(organization)
    setMembersDialogOpen(true)
  }

  // Filter organizations by search query
  const filteredOrganizations = organizations.filter((org) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      org.name.toLowerCase().includes(query) ||
      (org.description || '').toLowerCase().includes(query)
    )
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h1" fontWeight={600}>
          Organizations
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Manage all organizations in the instance
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          gap: 2,
        }}
      >
        <TextField
          size="small"
          placeholder="Search organizations..."
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
          onClick={handleCreateOrganization}
          size="small"
        >
          Create Organization
        </Button>
      </Box>

      <TableContainer sx={{ flexGrow: 1 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton width={150} />
                  </TableCell>
                  <TableCell>
                    <Skeleton width={250} />
                  </TableCell>
                  <TableCell>
                    <Skeleton width={100} />
                  </TableCell>
                  <TableCell align="right">
                    <Skeleton width={120} />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredOrganizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    {searchQuery
                      ? 'No organizations match your search.'
                      : 'No organizations found. Create one to get started.'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredOrganizations.map((organization) => (
                <TableRow key={organization.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {organization.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      noWrap
                      sx={{ maxWidth: 300 }}
                    >
                      {organization.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {organization.created_at
                        ? new Date(organization.created_at).toLocaleDateString()
                        : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Manage members">
                      <IconButton
                        size="small"
                        onClick={() => handleManageMembers(organization)}
                      >
                        <MembersIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit organization">
                      <IconButton
                        size="small"
                        onClick={() => handleEditOrganization(organization)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete organization">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteClick(organization)}
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

      <OrganizationEditDialog
        open={editDialogOpen}
        organization={editingOrganization}
        onClose={handleDialogClose}
        onSave={handleOrganizationSaved}
      />

      <OrganizationMembersDialog
        open={membersDialogOpen}
        organization={membersOrganization}
        onClose={() => {
          setMembersDialogOpen(false)
          setMembersOrganization(null)
        }}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Organization"
        message={`Are you sure you want to delete the organization "${deletingOrganization?.name}"? This will also delete all workspaces and data within it. This action cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setDeletingOrganization(null)
        }}
      />
    </Box>
  )
}
