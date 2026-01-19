import { useState, useEffect, useCallback, memo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Typography,
  Container,
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
} from '@mui/icons-material'
import type { Organization, OrganizationMember, Workspace, OrganizationSettings, ThemeSummary, ThemeCustomizations } from '../types'
import { fetchOrganization, fetchOrganizationMembers } from '../api/organizations'
import { fetchWorkspacesByOrganization } from '../api/workspaces'
import { fetchOrganizationSettings, updateOrganizationSettings, createTheme, updateTheme, fetchTheme } from '../api/settings'
import { useOrganization } from '../contexts/OrganizationContext'
import { useUser } from '../contexts/UserContext'
import { useTheme } from '../contexts/ThemeContext'
import OrganizationMembersDialog from './admin/OrganizationMembersDialog'
import WorkspaceMembersDialog from './admin/WorkspaceMembersDialog'
import { ThemeConfigurator } from '../components/settings/ThemeConfigurator'

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

// Memoized tab bar to match AssetTypeLayout style
const TabBar = memo(function TabBar({
  currentTab,
  onChange,
  membersCount,
  workspacesCount,
}: {
  currentTab: number
  onChange: (event: React.SyntheticEvent, newValue: number) => void
  membersCount: number
  workspacesCount: number
}) {
  return (
    <Box sx={{
      bgcolor: 'primary.main',
      color: 'primary.contrastText',
      '& .MuiTabs-indicator': {
        bgcolor: 'secondary.main'
      },
      '& .MuiTab-root': {
        color: '#ffffff',
        '&.Mui-selected': {
          color: '#ffffff'
        }
      },
    }}>
      <Tabs
        value={currentTab}
        onChange={onChange}
        textColor="inherit"
        sx={{ px: 2 }}
      >
        <Tab
          label={`Members (${membersCount})`}
          value={0}
        />
        <Tab
          label={`Workspaces (${workspacesCount})`}
          value={1}
        />
        <Tab
          label="Theme"
          value={2}
        />
      </Tabs>
    </Box>
  )
})


export default function OrganizationManagePage() {
  const { organizationId } = useParams<{ organizationId: string }>()
  const { activeOrganization } = useOrganization()
  const { hasOrganizationPermission, hasAnyInstancePermission } = useUser()
  const { refreshTheme } = useTheme()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null)
  const [themes, setThemes] = useState<ThemeSummary[]>([])
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState<'light' | 'dark'>('light')
  const [loading, setLoading] = useState(true)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [tabValue, setTabValue] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  // Dialog states
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [workspaceMembersDialogOpen, setWorkspaceMembersDialogOpen] = useState(false)
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)

  // Permission check for theme editing
  const canEditTheme = organizationId && (
    hasAnyInstancePermission(['instance:manage']) ||
    hasOrganizationPermission(organizationId, 'organization:admin') ||
    hasOrganizationPermission(organizationId, 'organization:write')
  )

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

  const loadSettings = useCallback(async () => {
    if (!organizationId) return

    setSettingsLoading(true)
    try {
      const settings = await fetchOrganizationSettings(organizationId)
      setOrgSettings(settings)
      setThemes(settings.themes || [])
      setSelectedThemeId(settings.theme)
    } catch (err) {
      console.error('Failed to load organization settings:', err)
    } finally {
      setSettingsLoading(false)
    }
  }, [organizationId])

  const handleSelectTheme = (themeId: string) => {
    setSelectedThemeId(themeId)
  }

  const handleFetchTheme = useCallback(async (themeId: string) => {
    if (!organizationId) throw new Error('No organization ID')
    return fetchTheme(organizationId, themeId)
  }, [organizationId])

  const handleSaveTheme = async () => {
    if (!organizationId || !selectedThemeId) return

    setIsSaving(true)
    try {
      await updateOrganizationSettings(organizationId, {
        theme: selectedThemeId,
      })
      // Refresh global theme to apply changes
      await refreshTheme(organizationId)
    } catch (err) {
      console.error('Failed to save theme settings:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateCustomTheme = async (
    name: string,
    lightCustomizations: ThemeCustomizations,
    darkCustomizations: ThemeCustomizations
  ) => {
    if (!organizationId) return

    try {
      const newTheme = await createTheme(organizationId, {
        name,
        lightCustomizations,
        darkCustomizations,
      })

      // Update settings with the new theme
      await updateOrganizationSettings(organizationId, {
        theme: newTheme.id,
      })

      // Refresh global theme
      await refreshTheme(organizationId)

      // Reload settings to get the updated themes list
      await loadSettings()
    } catch (err) {
      console.error('Failed to create custom theme:', err)
      throw err
    }
  }

  const handleUpdateTheme = async (
    themeId: string,
    lightCustomizations: ThemeCustomizations,
    darkCustomizations: ThemeCustomizations
  ) => {
    if (!organizationId) return

    try {
      await updateTheme(organizationId, themeId, {
        lightCustomizations,
        darkCustomizations,
      })

      // Refresh global theme to apply changes if this is the active theme
      if (selectedThemeId === themeId) {
        await refreshTheme(organizationId)
      }
    } catch (err) {
      console.error('Failed to update theme:', err)
      throw err
    }
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

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
      <Container maxWidth={false} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ bgcolor: 'primary.main', px: 2, py: 1 }}>
          <Skeleton variant="text" width={200} height={40} sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
        </Box>
        <Box sx={{ p: 3 }}>
          <Skeleton variant="text" width={300} height={24} sx={{ mb: 3 }} />
          <Skeleton variant="rectangular" height={400} />
        </Box>
      </Container>
    )
  }

  return (
    <Container maxWidth={false} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TabBar
        currentTab={tabValue}
        onChange={handleTabChange}
        membersCount={members.length}
        workspacesCount={workspaces.length}
      />

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <Box sx={{ p: 3, pb: 1 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
            Organization Management
          </Typography>
          <Typography variant="h4" component="h1" gutterBottom>
            {organization?.name || activeOrganization?.name || 'Organization'}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage members, workspaces, and settings for this organization.
          </Typography>
        </Box>

        {/* Members Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ px: 3 }}>
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
          <Box sx={{ px: 3 }}>
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

        {/* Theme Tab */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ px: 3 }}>
            <ThemeConfigurator
              themes={themes}
              selectedThemeId={selectedThemeId}
              editMode={editMode}
              onEditModeChange={setEditMode}
              onFetchTheme={handleFetchTheme}
              onSelectTheme={handleSelectTheme}
              onSave={handleSaveTheme}
              onCreateCustomTheme={handleCreateCustomTheme}
              onUpdateTheme={handleUpdateTheme}
              isLoading={settingsLoading}
              canEdit={!!canEditTheme}
              isSaving={isSaving}
            />
          </Box>
        </TabPanel>
      </Box>

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
