import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Typography,
  Container,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Tooltip,
  Skeleton,
  TextField,
  InputAdornment,
  Chip,
  Avatar,
} from '@mui/material'
import {
  Add as AddIcon,
  People as PeopleIcon,
  Folder as FolderIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import type { Organization, OrganizationMember, Workspace } from '../types'
import { fetchOrganization, fetchOrganizationMembers } from '../api/organizations'
import { fetchWorkspacesByOrganization } from '../api/workspaces'
import { useOrganization } from '../contexts/OrganizationContext'
import OrganizationMembersDialog from './admin/OrganizationMembersDialog'
import WorkspaceMembersDialog from './admin/WorkspaceMembersDialog'

interface TabPanelProps {
  children?: React.ReactNode
  value: number
  index: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  )
}

export default function OrganizationManagePage() {
  const { organizationId } = useParams<{ organizationId: string }>()
  const { activeOrganization } = useOrganization()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [tabValue, setTabValue] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  // Dialog states
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [workspaceMembersDialogOpen, setWorkspaceMembersDialogOpen] = useState(false)
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)

  const loadData = useCallback(async () => {
    if (!organizationId) return

    setLoading(true)
    try {
      const [orgData, membersData, workspacesData] = await Promise.all([
        fetchOrganization(organizationId),
        fetchOrganizationMembers(organizationId),
        fetchWorkspacesByOrganization(organizationId),
      ])
      setOrganization(orgData)
      setMembers(membersData)
      setWorkspaces(workspacesData)
    } catch (err) {
      console.error('Failed to load organization data:', err)
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
    setSearchQuery('')
  }

  const handleManageOrgMembers = () => {
    setMembersDialogOpen(true)
  }

  const handleManageWorkspaceMembers = (workspace: Workspace) => {
    setSelectedWorkspace(workspace)
    setWorkspaceMembersDialogOpen(true)
  }

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

  const roleLabels: Record<string, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
  }

  const roleColors: Record<string, 'warning' | 'primary' | 'default'> = {
    owner: 'warning',
    admin: 'primary',
    member: 'default',
  }

  // Filter members by search
  const filteredMembers = members.filter((m) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      (m.username || '').toLowerCase().includes(query) ||
      m.email.toLowerCase().includes(query)
    )
  })

  // Filter workspaces by search
  const filteredWorkspaces = workspaces.filter((w) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      w.name.toLowerCase().includes(query) ||
      (w.description || '').toLowerCase().includes(query)
    )
  })

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton variant="text" width={200} height={40} />
        <Skeleton variant="text" width={300} height={24} sx={{ mb: 3 }} />
        <Skeleton variant="rectangular" height={400} />
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
          Organization Management
        </Typography>
        <Typography variant="h4" component="h1" gutterBottom>
          {organization?.name || activeOrganization?.name || 'Organization'}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage members and workspaces for this organization.
        </Typography>
      </Box>

      <Paper elevation={1}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab
            icon={<PeopleIcon />}
            iconPosition="start"
            label={`Members (${members.length})`}
          />
          <Tab
            icon={<FolderIcon />}
            iconPosition="start"
            label={`Workspaces (${workspaces.length})`}
          />
        </Tabs>

        {/* Members Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ px: 2 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2,
              }}
            >
              <TextField
                size="small"
                placeholder="Search members..."
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
                onClick={handleManageOrgMembers}
                size="small"
              >
                Manage Members
              </Button>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Joined</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          {searchQuery
                            ? 'No members match your search.'
                            : 'No members in this organization.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMembers.map((member) => (
                      <TableRow key={member.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                              {getInitials(member.username, member.email)}
                            </Avatar>
                            <Typography variant="body2">
                              {member.username || member.email.split('@')[0]}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {member.email}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={roleLabels[member.role] || member.role}
                            size="small"
                            color={roleColors[member.role] || 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {member.joined_at
                              ? new Date(member.joined_at).toLocaleDateString()
                              : '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </TabPanel>

        {/* Workspaces Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ px: 2 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2,
              }}
            >
              <TextField
                size="small"
                placeholder="Search workspaces..."
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
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Workspace</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredWorkspaces.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          {searchQuery
                            ? 'No workspaces match your search.'
                            : 'No workspaces in this organization.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredWorkspaces.map((workspace) => (
                      <TableRow key={workspace.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FolderIcon fontSize="small" color="primary" />
                            <Typography variant="body2" fontWeight={500}>
                              {workspace.name}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            noWrap
                            sx={{ maxWidth: 300 }}
                          >
                            {workspace.description || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {workspace.created_at
                              ? new Date(workspace.created_at).toLocaleDateString()
                              : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Manage workspace members">
                            <IconButton
                              size="small"
                              onClick={() => handleManageWorkspaceMembers(workspace)}
                            >
                              <PeopleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </TabPanel>
      </Paper>

      {/* Organization Members Dialog */}
      <OrganizationMembersDialog
        open={membersDialogOpen}
        organization={organization}
        onClose={() => {
          setMembersDialogOpen(false)
          loadData() // Reload to reflect changes
        }}
      />

      {/* Workspace Members Dialog */}
      {organizationId && (
        <WorkspaceMembersDialog
          open={workspaceMembersDialogOpen}
          workspace={selectedWorkspace}
          organizationId={organizationId}
          onClose={() => {
            setWorkspaceMembersDialogOpen(false)
            setSelectedWorkspace(null)
          }}
        />
      )}
    </Container>
  )
}
