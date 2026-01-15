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
} from '@mui/material'
import type { Asset, AssetTypeAttribute } from '../types'
import { updateAssetAttributeValue } from '../api/assets'
import JsonEditor from './JsonEditor'
import AttributeValueRenderer from './AttributeValueRenderer'

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
  assetTypeId,
  onClose,
  onSuccess,
}: AssetEditDialogProps) {
  const [values, setValues] = useState<Record<string, any>>({})
  const [originalValues, setOriginalValues] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [savingAttribute, setSavingAttribute] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)

  // Get non-hidden attributes
  const editableAttributes = attributes.filter((attr) => !attr.isHidden)

  // Initialize values when dialog opens or asset changes
  useEffect(() => {
    if (open && asset) {
      console.log('AssetEditDialog: Initializing values', { assetId: asset.id, attributeCount: attributes.length })
      const initialValues: Record<string, any> = {}
      attributes.filter((attr) => !attr.isHidden).forEach((attr) => {
        initialValues[attr.apiKey] = asset.attributes?.[attr.apiKey] ?? null
      })
      console.log('AssetEditDialog: Initial values', initialValues)
      setValues(initialValues)
      setOriginalValues({ ...initialValues })
      setError(null)
      setSavedCount(0)
    }
  }, [open, asset?.id])

  const handleValueChange = (apiKey: string, value: any) => {
    setValues((prev) => ({ ...prev, [apiKey]: value }))
  }

  // Get changed attributes (excluding read-only ones)
  const getChangedAttributes = () => {
    return editableAttributes.filter((attr) => {
      // Skip read-only attributes
      if (attr.cannotOverride || attr.lockedToGlobal) return false
      const original = originalValues[attr.apiKey]
      const current = values[attr.apiKey]
      const originalStr = JSON.stringify(original)
      const currentStr = JSON.stringify(current)
      const isChanged = originalStr !== currentStr
      if (isChanged) {
        console.log(`Changed: ${attr.apiKey}`, { original, current, originalStr, currentStr })
      }
      return isChanged
    })
  }

  const handleSave = async () => {
    if (!asset) return

    const changedAttrs = getChangedAttributes()
    if (changedAttrs.length === 0) {
      onClose()
      return
    }

    setLoading(true)
    setError(null)
    setSavedCount(0)

    let lastAsset = asset
    let errorOccurred = false

    // Save each changed attribute sequentially
    for (const attr of changedAttrs) {
      if (errorOccurred) break

      setSavingAttribute(attr.id)
      try {
        const response = await updateAssetAttributeValue(
          workspaceId,
          assetTypeId,
          asset.id,
          attr.id,
          values[attr.apiKey]
        )
        if (response.asset) {
          lastAsset = response.asset
        }
        setSavedCount((prev) => prev + 1)
      } catch (err) {
        setError(`Failed to save ${attr.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        errorOccurred = true
      }
    }

    setSavingAttribute(null)
    setLoading(false)

    if (!errorOccurred) {
      onSuccess(lastAsset)
      onClose()
    }
  }

  const handleClose = () => {
    if (!loading) {
      setValues({})
      setOriginalValues({})
      setError(null)
      onClose()
    }
  }

  const changedCount = getChangedAttributes().length
  const hasRequiredEmpty = editableAttributes.some(
    (attr) => attr.isRequired && (values[attr.apiKey] === null || values[attr.apiKey] === '')
  )

  if (!asset) return null

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Edit Attributes
        <Typography variant="body2" color="text.secondary">
          {asset.name}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={0} divider={<Divider />}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {editableAttributes.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>
              No editable attributes available
            </Typography>
          ) : (
            editableAttributes.map((attr) => (
              <AttributeRow
                key={attr.id}
                attribute={attr}
                value={values[attr.apiKey]}
                onChange={(value) => handleValueChange(attr.apiKey, value)}
                disabled={loading}
              />
            ))
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        <Typography variant="body2" color="text.secondary">
          {loading
            ? `Saving... (${savedCount}/${changedCount})`
            : changedCount > 0
              ? `${changedCount} change${changedCount !== 1 ? 's' : ''}`
              : 'No changes'}
        </Typography>
        <Box>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={loading || changedCount === 0}
            sx={{ ml: 1 }}
          >
            {loading ? <CircularProgress size={24} /> : 'Save Changes'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}
