import { useMemo } from 'react'
import { Box, Typography, Paper, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material'
import {
  Business as OrganizationIcon,
  Workspaces as WorkspaceIcon,
  Security as RolesIcon,
  People as UsersIcon,
  Groups as GroupsIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@app/contexts/UserContext'
import { useOrganization } from '@app/contexts/OrganizationContext'

interface SettingsSection {
  title: string
  items: SettingsItem[]
}

interface SettingsItem {
  label: string
  description: string
  icon: React.ReactNode
  path: string
  visible: boolean
}

export default function SettingsIndexPage() {
  const navigate = useNavigate()
  const { hasInstancePermission, hasOrganizationPermission, hasWorkspacePermission, hasAnyInstancePermission } = useUser()
  const { activeOrganization, activeWorkspace } = useOrganization()

  const canManageOrganization = activeOrganization && hasOrganizationPermission(activeOrganization.id, 'organization:manage')
  const canManageWorkspace = activeWorkspace && hasWorkspacePermission(activeWorkspace.id, 'workspace:manage')

  const canManageRoles = hasAnyInstancePermission(['instance:manage', 'role:create', 'role:write', 'role:delete'])
  const canManageUsers = hasAnyInstancePermission(['instance:manage', 'user:create', 'user:write', 'user:delete'])
  const canManageGroups = hasAnyInstancePermission(['instance:manage', 'user:create', 'user:write', 'user:delete'])
  const canManageOrganizations = hasAnyInstancePermission(['instance:manage', 'organization:create', 'organization:write', 'organization:delete'])

  const sections: SettingsSection[] = useMemo(() => [
    {
      title: 'Instance',
      items: [
        {
          label: 'Roles',
          description: 'Manage roles and permissions across the system',
          icon: <RolesIcon />,
          path: '/settings/roles',
          visible: canManageRoles,
        },
        {
          label: 'Users',
          description: 'Manage user accounts',
          icon: <UsersIcon />,
          path: '/settings/users',
          visible: canManageUsers,
        },
        {
          label: 'Groups',
          description: 'Manage user groups for bulk permission assignment',
          icon: <GroupsIcon />,
          path: '/settings/groups',
          visible: canManageGroups,
        },
        {
          label: 'Organizations',
          description: 'Manage all organizations',
          icon: <OrganizationIcon />,
          path: '/settings/organizations',
          visible: canManageOrganizations,
        },
      ],
    },
    {
      title: 'Organization',
      items: [
        {
          label: activeOrganization?.name || 'Organization Settings',
          description: 'Manage organization settings and members',
          icon: <OrganizationIcon />,
          path: `/settings/organizations/${activeOrganization?.id}/manage`,
          visible: !!canManageOrganization,
        },
      ],
    },
    {
      title: 'Workspace',
      items: [
        {
          label: activeWorkspace?.name || 'Workspace Settings',
          description: 'Manage workspace settings and access',
          icon: <WorkspaceIcon />,
          path: `/organizations/${activeOrganization?.id}/workspaces/${activeWorkspace?.id}/settings`,
          visible: !!canManageWorkspace,
        },
      ],
    },
  ], [activeOrganization, activeWorkspace, canManageRoles, canManageUsers, canManageGroups, canManageOrganizations, canManageOrganization, canManageWorkspace])

  // Filter sections to only show those with visible items
  const visibleSections = sections.filter(section =>
    section.items.some(item => item.visible)
  )

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="body1" color="text.secondary">
          Manage your instance, organization, and workspace settings
        </Typography>
      </Box>

      {visibleSections.map(section => {
        const visibleItems = section.items.filter(item => item.visible)
        if (visibleItems.length === 0) return null

        return (
          <Box key={section.title} sx={{ mb: 4 }}>
            <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {section.title}
            </Typography>
            <Paper variant="outlined">
              <List disablePadding>
                {visibleItems.map((item, index) => (
                  <ListItemButton
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    divider={index < visibleItems.length - 1}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      secondary={item.description}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          </Box>
        )
      })}

      {visibleSections.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            You don't have permission to access any settings.
          </Typography>
        </Paper>
      )}
    </Box>
  )
}
