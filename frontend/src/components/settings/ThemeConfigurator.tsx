import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Grid,
  Button,
  Divider,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ListSubheader,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { ColorPicker } from './ColorPicker'
import { ThemePreview } from './ThemePreview'
import type { ThemeSummary, ThemeCustomizations, EffectiveTheme, Theme } from '@app/types'

interface ThemeConfiguratorProps {
  // Available themes from the server (presets + custom)
  themes: ThemeSummary[]
  // Currently selected theme ID (null for custom/new)
  selectedThemeId: string | null
  // Current mode being edited (light or dark)
  editMode: 'light' | 'dark'
  onEditModeChange: (mode: 'light' | 'dark') => void
  // Callback to fetch full theme data for preview
  onFetchTheme: (themeId: string) => Promise<Theme>
  // Callbacks
  onSelectTheme: (themeId: string) => void
  onSave: () => Promise<void>
  onCreateCustomTheme?: (name: string, lightCustomizations: ThemeCustomizations, darkCustomizations: ThemeCustomizations) => Promise<void>
  onUpdateTheme?: (themeId: string, lightCustomizations: ThemeCustomizations, darkCustomizations: ThemeCustomizations) => Promise<void>
  onUpdateCustomizations?: (lightCustomizations: ThemeCustomizations, darkCustomizations: ThemeCustomizations) => void
  // Workspace-specific
  isWorkspace?: boolean
  inheritTheme?: boolean
  onInheritChange?: (inherit: boolean) => void
  inheritedTheme?: EffectiveTheme | null
  // State
  isLoading?: boolean
  canEdit?: boolean
  isSaving?: boolean
}

export function ThemeConfigurator({
  themes,
  selectedThemeId,
  editMode,
  onEditModeChange,
  onFetchTheme,
  onSelectTheme,
  onSave,
  onCreateCustomTheme,
  onUpdateTheme,
  onUpdateCustomizations,
  isWorkspace = false,
  inheritTheme = true,
  onInheritChange,
  inheritedTheme,
  isLoading = false,
  canEdit = true,
  isSaving = false,
}: ThemeConfiguratorProps) {
  const [isDirty, setIsDirty] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<string | false>('primary')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [newThemeName, setNewThemeName] = useState('')
  const [isSavingNew, setIsSavingNew] = useState(false)
  const [isEditingTheme, setIsEditingTheme] = useState(false)  // true when editing an existing custom theme
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null)  // ID of theme being edited
  const [customLightCustomizations, setCustomLightCustomizations] = useState<ThemeCustomizations>({})
  const [customDarkCustomizations, setCustomDarkCustomizations] = useState<ThemeCustomizations>({})
  const [isUpdatingTheme, setIsUpdatingTheme] = useState(false)

  // Cache of fetched theme data for preview
  const [themeCache, setThemeCache] = useState<Record<string, Theme>>({})
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // Separate themes into presets and custom
  const presetThemes = themes.filter(t => t.themeType === 'preset')
  const customThemes = themes.filter(t => t.themeType === 'custom')

  // Sync previewThemeId with selectedThemeId from parent
  useEffect(() => {
    if (selectedThemeId) {
      setPreviewThemeId(selectedThemeId)
    }
  }, [selectedThemeId])

  // Fetch theme data when previewThemeId changes
  useEffect(() => {
    if (!previewThemeId) return
    // Skip if already cached
    if (themeCache[previewThemeId]) return

    let cancelled = false
    setIsLoadingPreview(true)

    onFetchTheme(previewThemeId)
      .then((theme) => {
        if (!cancelled) {
          setThemeCache(prev => ({ ...prev, [previewThemeId]: theme }))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to fetch theme for preview:', err)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPreview(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [previewThemeId, onFetchTheme])

  const handleDropdownChange = async (value: string) => {
    if (value === 'new-custom') {
      // Enter custom creation mode (creating a new theme)
      setIsEditingTheme(false)
      setEditingThemeId(null)
      // Initialize with current preview theme's customizations
      const currentTheme = previewThemeId ? themeCache[previewThemeId] : null
      setCustomLightCustomizations(currentTheme?.lightCustomizations || {})
      setCustomDarkCustomizations(currentTheme?.darkCustomizations || {})
      setIsDirty(true)
    } else {
      // Selected an existing theme
      setPreviewThemeId(value)
      onSelectTheme(value)
      setIsDirty(true)

      // Fetch theme data if not cached
      let theme = themeCache[value]
      if (!theme) {
        try {
          theme = await onFetchTheme(value)
          setThemeCache(prev => ({ ...prev, [value]: theme }))
        } catch (err) {
          console.error('Failed to fetch theme:', err)
        }
      }

      // Check if this is a custom theme - if so, enter edit mode
      const selectedTheme = themes.find(t => t.id === value)
      if (selectedTheme?.themeType === 'custom' && theme) {
        setIsEditingTheme(true)
        setEditingThemeId(value)
        setCustomLightCustomizations(theme.lightCustomizations || {})
        setCustomDarkCustomizations(theme.darkCustomizations || {})
      } else {
        // Clear editing state when switching to a preset theme
        setIsEditingTheme(false)
        setEditingThemeId(null)
        setCustomLightCustomizations({})
        setCustomDarkCustomizations({})
      }
    }
  }

  const handleStartEditTheme = () => {
    // Start editing the currently selected custom theme
    const theme = previewThemeId ? themeCache[previewThemeId] : null
    if (theme) {
      setIsEditingTheme(true)
      setEditingThemeId(previewThemeId)
      setCustomLightCustomizations(theme.lightCustomizations || {})
      setCustomDarkCustomizations(theme.darkCustomizations || {})
    }
  }

  const handleUpdateTheme = async () => {
    if (!onUpdateTheme || !editingThemeId) return
    setIsUpdatingTheme(true)
    try {
      await onUpdateTheme(editingThemeId, customLightCustomizations, customDarkCustomizations)
      // Update the cache with new customizations
      setThemeCache(prev => ({
        ...prev,
        [editingThemeId]: {
          ...prev[editingThemeId],
          lightCustomizations: customLightCustomizations,
          darkCustomizations: customDarkCustomizations,
        },
      }))
      setIsDirty(false)
    } finally {
      setIsUpdatingTheme(false)
    }
  }

  // Check if we're in any kind of editing mode (new or existing)
  const isInEditMode = isEditingTheme || (!previewThemeId && customLightCustomizations !== null)

  const handleColorChange = (category: keyof ThemeCustomizations, key: string, value: string) => {
    const isLightMode = editMode === 'light'
    const currentCustomizations = isLightMode ? customLightCustomizations : customDarkCustomizations
    const setCustomizations = isLightMode ? setCustomLightCustomizations : setCustomDarkCustomizations

    const currentCategory = currentCustomizations[category] || {}
    const newCustomizations = {
      ...currentCustomizations,
      [category]: {
        ...(typeof currentCategory === 'object' ? currentCategory : {}),
        [key]: value,
      },
    }
    setCustomizations(newCustomizations)

    // Notify parent of customization changes
    if (onUpdateCustomizations) {
      if (isLightMode) {
        onUpdateCustomizations(newCustomizations, customDarkCustomizations)
      } else {
        onUpdateCustomizations(customLightCustomizations, newCustomizations)
      }
    }
    setIsDirty(true)
  }

  const handleSave = async () => {
    await onSave()
    setIsDirty(false)
  }

  const handleSaveAsNew = async () => {
    if (!onCreateCustomTheme || !newThemeName.trim()) return
    setIsSavingNew(true)
    try {
      await onCreateCustomTheme(newThemeName.trim(), customLightCustomizations, customDarkCustomizations)
      setSaveDialogOpen(false)
      setNewThemeName('')
      setIsEditingTheme(false)
      setEditingThemeId(null)
      setCustomLightCustomizations({})
      setCustomDarkCustomizations({})
      setIsDirty(false)
    } finally {
      setIsSavingNew(false)
    }
  }

  const handlePanelChange = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedPanel(isExpanded ? panel : false)
  }

  // Get the cached theme for preview
  const cachedPreviewTheme = previewThemeId ? themeCache[previewThemeId] : null

  // Check if we're creating a new theme (not editing existing)
  const isCreatingNew = !editingThemeId && Object.keys(customLightCustomizations).length > 0

  // Determine effective config for preview
  // For workspace with inherit, use the inherited theme
  // For editing mode, use the local customizations being edited
  // Otherwise, use the cached theme from the dropdown selection
  const previewTheme: EffectiveTheme = useMemo(() => {
    if (isWorkspace && inheritTheme && inheritedTheme) {
      return inheritedTheme
    }
    // When editing (new or existing), show the customizations being edited
    if (isEditingTheme || isCreatingNew) {
      const editingTheme = editingThemeId ? themeCache[editingThemeId] : null
      return {
        id: editingThemeId,
        name: editingTheme?.name || 'Custom',
        themeType: 'custom' as const,
        lightCustomizations: customLightCustomizations,
        darkCustomizations: customDarkCustomizations,
      }
    }
    if (cachedPreviewTheme) {
      return {
        id: cachedPreviewTheme.id,
        name: cachedPreviewTheme.name,
        themeType: cachedPreviewTheme.themeType,
        lightCustomizations: cachedPreviewTheme.lightCustomizations,
        darkCustomizations: cachedPreviewTheme.darkCustomizations,
      }
    }
    // Fallback to empty theme
    return {
      id: null,
      name: 'Default',
      themeType: 'preset' as const,
      lightCustomizations: {},
      darkCustomizations: {},
    }
  }, [isWorkspace, inheritTheme, inheritedTheme, isEditingTheme, isCreatingNew, editingThemeId, themeCache, customLightCustomizations, customDarkCustomizations, cachedPreviewTheme])

  // Get current colors for display in color pickers
  const getColor = (category: keyof ThemeCustomizations, key: string, defaultValue: string): string => {
    // When editing, use the local customizations
    const useLocalCustomizations = isEditingTheme || isCreatingNew
    const customizations = editMode === 'light'
      ? (useLocalCustomizations ? customLightCustomizations : cachedPreviewTheme?.lightCustomizations)
      : (useLocalCustomizations ? customDarkCustomizations : cachedPreviewTheme?.darkCustomizations)

    const cat = customizations?.[category]
    if (cat && typeof cat === 'object' && key in cat) {
      return (cat as Record<string, string>)[key] || defaultValue
    }
    return defaultValue
  }

  // Get dropdown value
  const getDropdownValue = () => {
    if (isCreatingNew && !editingThemeId) {
      return 'new-custom'
    }
    return previewThemeId || selectedThemeId || ''
  }

  // Get the name of the theme being edited
  const editingThemeName = editingThemeId ? themeCache[editingThemeId]?.name : null

  if (isLoading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Theme Configuration
      </Typography>

      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You need admin permissions to modify theme settings.
        </Alert>
      )}

      {isWorkspace && onInheritChange && (
        <FormControlLabel
          control={
            <Switch
              checked={inheritTheme}
              onChange={(e) => {
                onInheritChange(e.target.checked)
                setIsDirty(true)
              }}
              disabled={!canEdit}
            />
          }
          label="Inherit theme from organization"
          sx={{ mb: 2, display: 'block' }}
        />
      )}

      {(!isWorkspace || !inheritTheme) && (
        <>
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Theme</InputLabel>
            <Select
              value={getDropdownValue()}
              label="Theme"
              onChange={(e) => handleDropdownChange(e.target.value)}
              disabled={!canEdit}
            >
              {/* Preset Themes from Server */}
              {presetThemes.length > 0 && (
                <ListSubheader>Presets</ListSubheader>
              )}
              {presetThemes.map((theme) => (
                <MenuItem key={theme.id} value={theme.id}>
                  {theme.name}
                </MenuItem>
              ))}

              {/* Custom Themes from Server */}
              <ListSubheader>Saved Themes</ListSubheader>
              {customThemes.map((theme) => (
                <MenuItem key={theme.id} value={theme.id}>
                  {theme.name}
                </MenuItem>
              ))}
              {customThemes.length === 0 && (
                <MenuItem disabled value="">
                  <em>No saved themes</em>
                </MenuItem>
              )}

              {/* Create Custom Theme Option */}
              <ListSubheader>Custom</ListSubheader>
              <MenuItem value="new-custom">
                {isCreatingNew ? 'New Custom Theme' : '+ Create Custom Theme'}
              </MenuItem>
            </Select>
          </FormControl>

          {(isEditingTheme || isCreatingNew) && (
            <>
              <Divider sx={{ my: 2 }} />

              {/* Show which theme is being edited */}
              {isEditingTheme && editingThemeName && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Editing theme: <strong>{editingThemeName}</strong>
                </Alert>
              )}

              {/* Mode Toggle for editing light/dark */}
              <FormControl sx={{ mb: 2, minWidth: 200 }}>
                <InputLabel>Editing Mode</InputLabel>
                <Select
                  value={editMode}
                  label="Editing Mode"
                  onChange={(e) => onEditModeChange(e.target.value as 'light' | 'dark')}
                  disabled={!canEdit}
                >
                  <MenuItem value="light">Light Mode Colors</MenuItem>
                  <MenuItem value="dark">Dark Mode Colors</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="subtitle1" gutterBottom>
                {isEditingTheme ? 'Edit Colors' : 'Custom Colors'} ({editMode === 'light' ? 'Light Mode' : 'Dark Mode'})
              </Typography>

              {/* Primary Colors */}
              <Accordion
                expanded={expandedPanel === 'primary'}
                onChange={handlePanelChange('primary')}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Primary Colors</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Main"
                        value={getColor('primary', 'main', '#003162')}
                        onChange={(v) => handleColorChange('primary', 'main', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Light"
                        value={getColor('primary', 'light', '#42a5f5')}
                        onChange={(v) => handleColorChange('primary', 'light', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Dark"
                        value={getColor('primary', 'dark', '#1565c0')}
                        onChange={(v) => handleColorChange('primary', 'dark', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>

              {/* Secondary Colors */}
              <Accordion
                expanded={expandedPanel === 'secondary'}
                onChange={handlePanelChange('secondary')}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Secondary Colors</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Main"
                        value={getColor('secondary', 'main', '#fecf18')}
                        onChange={(v) => handleColorChange('secondary', 'main', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Light"
                        value={getColor('secondary', 'light', '#fed54a')}
                        onChange={(v) => handleColorChange('secondary', 'light', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Dark"
                        value={getColor('secondary', 'dark', '#cab210')}
                        onChange={(v) => handleColorChange('secondary', 'dark', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>

              {/* Button Colors */}
              <Accordion
                expanded={expandedPanel === 'button'}
                onChange={handlePanelChange('button')}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Button Colors</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Main"
                        value={getColor('button', 'main', getColor('primary', 'main', '#003162'))}
                        onChange={(v) => handleColorChange('button', 'main', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Light"
                        value={getColor('button', 'light', getColor('primary', 'light', '#42a5f5'))}
                        onChange={(v) => handleColorChange('button', 'light', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Dark"
                        value={getColor('button', 'dark', getColor('primary', 'dark', '#1565c0'))}
                        onChange={(v) => handleColorChange('button', 'dark', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>

              {/* Background Colors */}
              <Accordion
                expanded={expandedPanel === 'background'}
                onChange={handlePanelChange('background')}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Background Colors</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Default"
                        value={getColor('background', 'default', editMode === 'light' ? '#f5f5f5' : '#121212')}
                        onChange={(v) => handleColorChange('background', 'default', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Paper"
                        value={getColor('background', 'paper', editMode === 'light' ? '#ffffff' : '#1e1e1e')}
                        onChange={(v) => handleColorChange('background', 'paper', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>

              {/* Text Colors */}
              <Accordion
                expanded={expandedPanel === 'text'}
                onChange={handlePanelChange('text')}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Text Colors</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Primary"
                        value={getColor('text', 'primary', editMode === 'light' ? '#212121' : '#ffffff')}
                        onChange={(v) => handleColorChange('text', 'primary', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <ColorPicker
                        label="Secondary"
                        value={getColor('text', 'secondary', editMode === 'light' ? '#757575' : '#b0b0b0')}
                        onChange={(v) => handleColorChange('text', 'secondary', v)}
                        disabled={!canEdit}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>

            </>
          )}
        </>
      )}

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle1" gutterBottom>
        Preview
      </Typography>
      <Box sx={{ mb: 3, position: 'relative' }}>
        {isLoadingPreview && (
          <Box sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(255,255,255,0.7)',
            zIndex: 1,
            borderRadius: 2,
          }}>
            <CircularProgress size={32} />
          </Box>
        )}
        <ThemePreview effectiveTheme={previewTheme} />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, pb: 1 }}>
        {canEdit ? (
          <>
            {/* When editing an existing custom theme, show Save Theme button */}
            {isEditingTheme && onUpdateTheme && (
              <Button
                variant="outlined"
                onClick={handleUpdateTheme}
                disabled={isUpdatingTheme}
              >
                {isUpdatingTheme ? 'Saving...' : 'Save Theme Changes'}
              </Button>
            )}
            {/* When creating a new theme, show Save as New Theme button */}
            {isCreatingNew && onCreateCustomTheme && (
              <Button
                variant="outlined"
                onClick={() => setSaveDialogOpen(true)}
              >
                Save as New Theme
              </Button>
            )}
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? 'Saving...' : 'Apply Theme'}
            </Button>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            You need admin permissions to modify theme settings.
          </Typography>
        )}
      </Box>

      {/* Save As New Theme Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Save as New Theme</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Theme Name"
            value={newThemeName}
            onChange={(e) => setNewThemeName(e.target.value)}
            sx={{ mt: 2 }}
            placeholder="e.g., Corporate Blue"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveAsNew}
            disabled={!newThemeName.trim() || isSavingNew}
          >
            {isSavingNew ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
