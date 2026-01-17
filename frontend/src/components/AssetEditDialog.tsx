import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  CircularProgress,
  Alert,
  Stack,
  Typography,
  Box,
  Divider,
  Select,
  MenuItem,
  FormControl,
  Tabs,
  Tab,
  useTheme,
} from '@mui/material'
import type { Asset, AssetTypeAttribute, AssetTypeAttributeChoice } from '@app/types'
import { updateAsset } from '@app/api/assets'
import JsonEditor from '@app/components/JsonEditor'
import AttributeValueRenderer from '@app/components/AttributeValueRenderer'

// Fetch choices from an attribute's choices URL
async function fetchChoicesFromUrl(choicesUrl: string): Promise<AssetTypeAttributeChoice[]> {
  const response = await fetch(choicesUrl)
  if (!response.ok) return []
  const data = await response.json()
  return data.results || []
}

interface AssetEditDialogProps {
  open: boolean
  asset: Asset | null
  attributes: AssetTypeAttribute[]
  workspaceId: string
  assetTypeId: string
  onClose: () => void
  onSuccess: (updatedAsset: Asset) => void
}

// Individual attribute editor row
function AttributeRow({
  attribute,
  value,
  onChange,
  disabled,
}: {
  attribute: AssetTypeAttribute
  value: any
  onChange: (value: any) => void
  disabled?: boolean
}) {
  const isReadOnly = attribute.cannotOverride || attribute.lockedToGlobal
  const [choices, setChoices] = useState<AssetTypeAttributeChoice[]>([])
  const [loadingChoices, setLoadingChoices] = useState(false)

  // Load choices when attribute has them
  useEffect(() => {
    if (attribute.hasChoices && attribute.apiUrl) {
      setLoadingChoices(true)
      fetchChoicesFromUrl(`${attribute.apiUrl}choices/`)
        .then(setChoices)
        .catch((err) => console.error('Failed to load choices:', err))
        .finally(() => setLoadingChoices(false))
    }
  }, [attribute.hasChoices, attribute.apiUrl])

  const renderInput = () => {
    // If attribute cannot be overridden, show read-only value
    if (isReadOnly) {
      return (
        <Box sx={{ py: 0.5 }}>
          <AttributeValueRenderer attribute={attribute} value={value} maxLines={2} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {attribute.lockedToGlobal ? 'Locked to global value' : 'Cannot be overridden'}
          </Typography>
        </Box>
      )
    }

    // If attribute has choices, render a Select dropdown
    if (attribute.hasChoices && choices.length > 0) {
      // Find the selected choice by matching value
      const selectedChoice = choices.find((c) => JSON.stringify(c.value) === JSON.stringify(value))

      // Format choice display value, including unit for numbers
      const formatChoiceValue = (choiceValue: any) => {
        if (typeof choiceValue === 'object') {
          return JSON.stringify(choiceValue)
        }
        const displayValue = String(choiceValue)
        // Add unit for number attributes
        if (attribute.attributeType === 'number' && attribute.unit) {
          return `${displayValue} ${attribute.unit}`
        }
        return displayValue
      }

      return (
        <FormControl fullWidth size="small" disabled={disabled || loadingChoices}>
          <Select
            value={selectedChoice?.id || ''}
            onChange={(e) => {
              const choice = choices.find((c) => c.id === e.target.value)
              onChange(choice ? choice.value : null)
            }}
            displayEmpty
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {choices.map((choice) => (
              <MenuItem key={choice.id} value={choice.id}>
                {choice.icon && <span style={{ marginRight: 8 }}>{choice.icon}</span>}
                {formatChoiceValue(choice.value)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )
    }

    // Show loading state while fetching choices
    if (attribute.hasChoices && loadingChoices) {
      return (
        <FormControl fullWidth size="small" disabled>
          <Select value="" displayEmpty>
            <MenuItem value="">Loading choices...</MenuItem>
          </Select>
        </FormControl>
      )
    }

    switch (attribute.attributeType) {
      case 'boolean':
        return (
          <FormControlLabel
            control={
              <Switch
                checked={value === true}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
                size="small"
              />
            }
            label={value ? 'Yes' : 'No'}
          />
        )
      case 'number':
        return (
          <TextField
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
            fullWidth
            size="small"
            disabled={disabled}
            inputProps={{ step: attribute.unit ? 0.01 : 1 }}
            InputProps={attribute.unit ? {
              endAdornment: (
                <Typography variant="body2" color="text.secondary" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
                  {attribute.unit}
                </Typography>
              ),
            } : undefined}
          />
        )
      case 'date':
        return (
          <TextField
            type="date"
            value={value ? value.split('T')[0] : ''}
            onChange={(e) => onChange(e.target.value || null)}
            fullWidth
            size="small"
            disabled={disabled}
            InputLabelProps={{ shrink: true }}
          />
        )
      case 'datetime':
        return (
          <TextField
            type="datetime-local"
            value={value ? value.slice(0, 16) : ''}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
            fullWidth
            size="small"
            disabled={disabled}
            InputLabelProps={{ shrink: true }}
          />
        )
      case 'json':
        return (
          <Box sx={{ minHeight: 120, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <JsonEditor
              value={{ json: value, rawJson: value ? JSON.stringify(value, null, 2) : '' }}
              onChange={(newValue) => {
                if (newValue && newValue.json !== undefined) {
                  onChange(newValue.json)
                } else {
                  onChange(null)
                }
              }}
              placeholder="Enter JSON..."
            />
          </Box>
        )
      case 'link':
        return (
          <Stack spacing={1}>
            <TextField
              placeholder="URL"
              value={value && typeof value === 'object' ? value.url || '' : typeof value === 'string' ? value : ''}
              onChange={(e) =>
                onChange(typeof value === 'object' ? { ...value, url: e.target.value } : { url: e.target.value, text: '' })
              }
              fullWidth
              size="small"
              disabled={disabled}
              type="url"
            />
            <TextField
              placeholder="Display text (optional)"
              value={value && typeof value === 'object' ? value.text || '' : ''}
              onChange={(e) =>
                onChange(typeof value === 'object' ? { ...value, text: e.target.value } : { url: '', text: e.target.value })
              }
              fullWidth
              size="small"
              disabled={disabled}
            />
          </Stack>
        )
      default: // text
        return (
          <TextField
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            fullWidth
            size="small"
            disabled={disabled}
            multiline={attribute.attributeType === 'text'}
            rows={attribute.attributeType === 'text' ? 2 : 1}
          />
        )
    }
  }

  const getScopeLabel = () => {
    if (attribute.scope === 'local') return 'Local'
    if (attribute.scope === 'override') return 'Override'
    return 'Global'
  }

  const getScopeColor = () => {
    if (attribute.scope === 'local') return 'info.main'
    if (attribute.scope === 'override') return 'warning.main'
    return 'text.secondary'
  }

  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', py: 1 }}>
      <Box sx={{ minWidth: 150, maxWidth: 200, flexShrink: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
          {attribute.name}
          {attribute.isRequired && <Typography component="span" color="error.main"> *</Typography>}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {attribute.attributeType}
          {' · '}
          <Typography component="span" variant="caption" sx={{ color: getScopeColor() }}>
            {getScopeLabel()}
          </Typography>
        </Typography>
      </Box>
      <Box sx={{ flex: 1 }}>{renderInput()}</Box>
    </Box>
  )
}

export default function AssetEditDialog({
  open,
  asset,
  attributes,
  workspaceId,
  onClose,
  onSuccess,
}: AssetEditDialogProps) {
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const [activeTab, setActiveTab] = useState(0)
  const [name, setName] = useState('')
  const [longitude, setLongitude] = useState<string>('')
  const [latitude, setLatitude] = useState<string>('')
  const [attributeValues, setAttributeValues] = useState<Record<string, any>>({})
  const [originalName, setOriginalName] = useState('')
  const [originalCoords, setOriginalCoords] = useState<[number, number] | null>(null)
  const [originalAttributes, setOriginalAttributes] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get non-hidden attributes
  const editableAttributes = attributes.filter((attr) => !attr.isHidden)

  // Initialize values when dialog opens or asset changes
  useEffect(() => {
    if (open && asset) {
      // Name
      setName(asset.name || '')
      setOriginalName(asset.name || '')

      // Location (prefer location over geometry)
      const coords = asset.location?.coordinates || asset.geometry?.coordinates
      if (coords && coords.length >= 2) {
        setLongitude(String(coords[0]))
        setLatitude(String(coords[1]))
        setOriginalCoords([coords[0], coords[1]])
      } else {
        setLongitude('')
        setLatitude('')
        setOriginalCoords(null)
      }

      // Attributes
      const initialValues: Record<string, any> = {}
      attributes.filter((attr) => !attr.isHidden).forEach((attr) => {
        initialValues[attr.apiKey] = asset.attributes?.[attr.apiKey] ?? null
      })
      setAttributeValues(initialValues)
      setOriginalAttributes({ ...initialValues })

      setError(null)
      setActiveTab(0)
    }
  }, [open, asset?.id])

  const handleAttributeChange = (apiKey: string, value: any) => {
    setAttributeValues((prev) => ({ ...prev, [apiKey]: value }))
  }

  // Check what has changed
  const hasNameChanged = name !== originalName
  const hasLocationChanged = (() => {
    const newLng = longitude ? parseFloat(longitude) : null
    const newLat = latitude ? parseFloat(latitude) : null
    if (originalCoords === null && (newLng === null || newLat === null)) return false
    if (originalCoords === null && newLng !== null && newLat !== null) return true
    if (originalCoords !== null && (newLng === null || newLat === null)) return true
    return originalCoords![0] !== newLng || originalCoords![1] !== newLat
  })()

  const getChangedAttributes = () => {
    return editableAttributes.filter((attr) => {
      // Skip read-only attributes
      if (attr.cannotOverride || attr.lockedToGlobal) return false
      const original = originalAttributes[attr.apiKey]
      const current = attributeValues[attr.apiKey]
      return JSON.stringify(original) !== JSON.stringify(current)
    })
  }

  const changedAttributeCount = getChangedAttributes().length
  const totalChanges = (hasNameChanged ? 1 : 0) + (hasLocationChanged ? 1 : 0) + changedAttributeCount

  const handleSave = async () => {
    if (!asset) return

    if (totalChanges === 0) {
      onClose()
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Build the PATCH payload
      const payload: {
        name?: string
        location?: { type: string; coordinates: number[] } | null
        attributes?: Record<string, any>
      } = {}

      if (hasNameChanged) {
        payload.name = name
      }

      if (hasLocationChanged) {
        const lng = longitude ? parseFloat(longitude) : null
        const lat = latitude ? parseFloat(latitude) : null
        if (lng !== null && lat !== null && !isNaN(lng) && !isNaN(lat)) {
          payload.location = {
            type: 'Point',
            coordinates: [lng, lat],
          }
        } else {
          payload.location = null
        }
      }

      if (changedAttributeCount > 0) {
        const changedAttrs = getChangedAttributes()
        payload.attributes = {}
        for (const attr of changedAttrs) {
          payload.attributes[attr.apiKey] = attributeValues[attr.apiKey]
        }
      }

      const updatedAsset = await updateAsset(workspaceId, asset.id, payload)
      onSuccess(updatedAsset)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setName('')
      setLongitude('')
      setLatitude('')
      setAttributeValues({})
      setError(null)
      onClose()
    }
  }

  if (!asset) return null

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Edit Asset
        <Typography variant="body2" color="text.secondary">
          {asset.name}
        </Typography>
      </DialogTitle>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        textColor={isDarkMode ? 'secondary' : 'primary'}
        indicatorColor={isDarkMode ? 'secondary' : 'primary'}
        sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="General" />
        <Tab label={`Attributes${changedAttributeCount > 0 ? ` (${changedAttributeCount})` : ''}`} />
      </Tabs>
      <DialogContent sx={{ minHeight: 300 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {activeTab === 0 && (
          <Stack spacing={3} sx={{ pt: 1 }}>
            {/* Name */}
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              disabled={loading}
              required
              error={!name.trim()}
              helperText={!name.trim() ? 'Name is required' : hasNameChanged ? 'Modified' : undefined}
            />

            {/* Location */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Location
                {hasLocationChanged && (
                  <Typography component="span" variant="caption" color="warning.main" sx={{ ml: 1 }}>
                    Modified
                  </Typography>
                )}
              </Typography>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Longitude"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  fullWidth
                  disabled={loading}
                  type="number"
                  inputProps={{ step: 'any' }}
                  placeholder="-180 to 180"
                />
                <TextField
                  label="Latitude"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  fullWidth
                  disabled={loading}
                  type="number"
                  inputProps={{ step: 'any' }}
                  placeholder="-90 to 90"
                />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Enter coordinates in decimal degrees (e.g., -122.4194, 37.7749)
              </Typography>
            </Box>
          </Stack>
        )}

        {activeTab === 1 && (
          <Stack spacing={0} divider={<Divider />}>
            {editableAttributes.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>
                No editable attributes available
              </Typography>
            ) : (
              editableAttributes.map((attr) => (
                <AttributeRow
                  key={attr.id}
                  attribute={attr}
                  value={attributeValues[attr.apiKey]}
                  onChange={(value) => handleAttributeChange(attr.apiKey, value)}
                  disabled={loading}
                />
              ))
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        <Typography variant="body2" color="text.secondary">
          {loading
            ? 'Saving...'
            : totalChanges > 0
              ? `${totalChanges} change${totalChanges !== 1 ? 's' : ''}`
              : 'No changes'}
        </Typography>
        <Box>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={loading || totalChanges === 0 || !name.trim()}
            sx={{ ml: 1 }}
          >
            {loading ? <CircularProgress size={24} /> : 'Save Changes'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}
