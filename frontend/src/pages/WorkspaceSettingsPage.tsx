import { useState, useEffect, useCallback, memo } from 'react'
import { Box, Typography, Container, Tabs, Tab, Skeleton } from '@mui/material'
import { useParams } from 'react-router-dom'
import type { WorkspaceSettings, ThemeSummary, EffectiveTheme, ThemeCustomizations } from '@app/types'
import { fetchWorkspaceSettings, updateWorkspaceSettings, createTheme, updateTheme, fetchTheme } from '@app/api/settings'
import { useOrganization } from '@app/contexts/OrganizationContext'
import { useUser } from '@app/contexts/UserContext'
import { useTheme } from '@app/contexts/ThemeContext'
import { ThemeConfigurator } from '@app/components/settings/ThemeConfigurator'

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
}: {
  currentTab: number
  onChange: (event: React.SyntheticEvent, newValue: number) => void
}) {
  return (
    <Box sx={{
      bgcolor: 'primary.main',
      color: 'primary.contrastText',
      '& .MuiTabs-indicator': {
        bgcolor: 'secondary.main'
      },
      '& .MuiTab-root': {
        color: 'primary.contrastText',
        opacity: 0.7,
        '&.Mui-selected': {
          color: 'primary.contrastText',
          opacity: 1,
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
          label="General"
          value={0}
        />
        <Tab
          label="Theme"
          value={1}
        />
      </Tabs>
    </Box>
  )
})

export default function WorkspaceSettingsPage() {
  const { workspaceId, organizationId } = useParams<{ workspaceId: string; organizationId: string }>()
  const { activeOrganization, activeWorkspace } = useOrganization()
  const { hasWorkspacePermission, hasAnyInstancePermission } = useUser()
  const { refreshTheme } = useTheme()

  const [tabValue, setTabValue] = useState(0)
  const [wsSettings, setWsSettings] = useState<WorkspaceSettings | null>(null)
  const [themes, setThemes] = useState<ThemeSummary[]>([])
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState<'light' | 'dark'>('light')
  const [inheritTheme, setInheritTheme] = useState(true)
  const [inheritedTheme, setInheritedTheme] = useState<EffectiveTheme | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const orgId = organizationId || activeOrganization?.id
  const wsId = workspaceId || activeWorkspace?.id

  // Permission check for theme editing
  const canEditTheme = wsId && (
    hasAnyInstancePermission(['instance:manage']) ||
    hasWorkspacePermission(wsId, 'workspace:admin') ||
    hasWorkspacePermission(wsId, 'workspace:write')
  )

  const loadSettings = useCallback(async () => {
    if (!orgId || !wsId) return

    setSettingsLoading(true)
    try {
      const settings = await fetchWorkspaceSettings(orgId, wsId)
      setWsSettings(settings)
      setThemes(settings.themes || [])
      setSelectedThemeId(settings.theme)
      setInheritTheme(settings.inheritTheme)
      if (settings.inheritedFromOrg) {
        setInheritedTheme(settings.inheritedFromOrg)
      }
    } catch (err) {
      console.error('Failed to load workspace settings:', err)
    } finally {
      setSettingsLoading(false)
    }
  }, [orgId, wsId])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSelectTheme = (themeId: string) => {
    setSelectedThemeId(themeId)
  }

  const handleFetchTheme = useCallback(async (themeId: string) => {
    if (!orgId) throw new Error('No organization ID')
    return fetchTheme(orgId, themeId)
  }, [orgId])

  const handleSaveTheme = async () => {
    if (!orgId || !wsId) return

    setIsSaving(true)
    try {
      await updateWorkspaceSettings(orgId, wsId, {
        theme: inheritTheme ? null : selectedThemeId,
        inheritTheme,
      })
      // Refresh global theme to apply changes
      await refreshTheme(orgId, wsId)
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
    if (!orgId || !wsId) return

    try {
      const newTheme = await createTheme(orgId, {
        name,
        lightCustomizations,
        darkCustomizations,
      })

      // Update settings with the new theme
      await updateWorkspaceSettings(orgId, wsId, {
        theme: newTheme.id,
        inheritTheme: false,
      })

      // Refresh global theme
      await refreshTheme(orgId, wsId)

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
    if (!orgId) return

    try {
      await updateTheme(orgId, themeId, {
        lightCustomizations,
        darkCustomizations,
      })

      // Refresh global theme to apply changes if this is the active theme
      if (selectedThemeId === themeId && wsId) {
        await refreshTheme(orgId, wsId)
      }
    } catch (err) {
      console.error('Failed to update theme:', err)
      throw err
    }
  }

  const handleInheritChange = (inherit: boolean) => {
    setInheritTheme(inherit)
  }

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  if (settingsLoading && !wsSettings) {
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
      />

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <Box sx={{ p: 3, pb: 1 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
            Workspace Settings
          </Typography>
          <Typography variant="h4" component="h1" gutterBottom>
            {activeWorkspace?.name || 'Workspace'}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage settings for this workspace.
          </Typography>
        </Box>

        {/* General Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ px: 3 }}>
            <Typography variant="body1" color="text.secondary">
              General workspace settings will be available here.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Workspace ID: {wsId}
            </Typography>
          </Box>
        </TabPanel>

        {/* Theme Tab */}
        <TabPanel value={tabValue} index={1}>
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
              isWorkspace
              inheritTheme={inheritTheme}
              onInheritChange={handleInheritChange}
              inheritedTheme={inheritedTheme}
              isLoading={settingsLoading}
              canEdit={!!canEditTheme}
              isSaving={isSaving}
            />
          </Box>
        </TabPanel>
      </Box>
    </Container>
  )
}
