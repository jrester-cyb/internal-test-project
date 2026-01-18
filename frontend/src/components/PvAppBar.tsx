import { useNavigate, useNavigation } from 'react-router-dom'
import { AppBar, Toolbar, Typography, LinearProgress } from '@mui/material'
import {
  Help as HelpIcon,
  Person as PersonIcon,
  AccountCircle as AccountCircleIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Logout as LogoutIcon,
  Business as BusinessIcon,
  Public as PublicIcon,
} from '@mui/icons-material'
import ActionButtons from '@app/components/ActionButtons'
import { useTheme } from '@app/contexts/ThemeContext'
import { useOrganization } from '@app/contexts/OrganizationContext'
import { useLayout } from '@app/contexts/LayoutContext'

export default function PvAppBar() {
  const navigate = useNavigate()
  const navigation = useNavigation()
  const { isDarkMode, toggleTheme } = useTheme()
  const { organizations, activeOrganization, setActiveOrganization, workspaces, activeWorkspace, setActiveWorkspace, isGlobalMode } = useOrganization()
  const { windowWidth } = useLayout()

  const isNavigating = Boolean(navigation.location)

  const handleOrganizationSelect = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId)
    if (org) {
      setActiveOrganization(org)
      navigate(`/organizations/${orgId}`)
    }
  }

  const handleWorkspaceSelect = (workspaceId: string | null) => {
    if (workspaceId === null) {
      setActiveWorkspace(null)
      navigate(`/organizations/${activeOrganization?.id}/map`)
    } else {
      const workspace = workspaces.find(w => w.id === workspaceId)
      if (workspace) {
        setActiveWorkspace(workspace)
        navigate(`/organizations/${activeOrganization?.id}/workspaces/${workspaceId}/map`)
      }
    }
  }

  const handleHelp = () => {
    window.open('/help', '_blank')
  }

  const handleProfile = () => {
    navigate('/profile')
  }

  const workspaceSubmenu = [
    {
      id: 'global',
      label: 'Global (All Workspaces)',
      selected: isGlobalMode,
      onClick: () => handleWorkspaceSelect(null)
    },
    ...workspaces.map(ws => ({
      id: ws.id,
      label: ws.name,
      selected: activeWorkspace?.id === ws.id,
      onClick: () => handleWorkspaceSelect(ws.id)
    }))
  ]

  const toolbarActions = [
    ...(organizations.length > 1 ? [{
      label: `Organization: ${activeOrganization?.name || 'None'}`,
      icon: <BusinessIcon fontSize="small" />,
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: Infinity,
      submenu: organizations.map(org => ({
        id: org.id,
        label: org.name,
        selected: org.id === activeOrganization?.id,
        onClick: () => handleOrganizationSelect(org.id)
      }))
    }] : []),
    ...(workspaces.length > 0 ? [{
      label: isGlobalMode ? 'Global' : activeWorkspace?.name || 'Select Workspace',
      icon: isGlobalMode ? <PublicIcon fontSize="small" /> : <BusinessIcon fontSize="small" />,
      color: 'inherit' as const,
      variant: 'text' as const,
      dividerAfter: windowWidth >= 600,
      submenu: workspaceSubmenu
    }] : []),
    {
      label: 'Profile',
      icon: <PersonIcon fontSize="small" />,
      onClick: handleProfile,
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: Infinity,
    },
    {
      label: 'Help',
      icon: <HelpIcon fontSize="small" />,
      onClick: handleHelp,
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: 500,
      dividerAfter: true
    },
    {
      label: isDarkMode ? 'Toggle Light Mode' : 'Toggle Dark Mode',
      icon: isDarkMode ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />,
      onClick: toggleTheme,
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: 0
    },
    {
      label: 'Logout',
      icon: <LogoutIcon fontSize="small" />,
      onClick: () => console.log('Logout clicked'),
      color: 'inherit' as const,
      variant: 'text' as const,
      minWidth: Infinity
    }
  ]

  return (
    <AppBar position="fixed" color="primary" elevation={0}>
      <Toolbar>
        <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
          Asset Visualizer
        </Typography>
        <ActionButtons
          actions={toolbarActions}
          iconOnly
          size="small"
          spacing={0.5}
          width={windowWidth}
          menuIcon={<AccountCircleIcon />}
        />
      </Toolbar>
      {isNavigating && <LinearProgress color="secondary" />}
    </AppBar>
  )
}
