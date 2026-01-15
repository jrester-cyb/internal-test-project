import { useState } from 'react'
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
} from '@mui/material'
import type { Asset, AssetTypeAttribute } from '../types'
import { updateAssetAttributeValue } from '../api/assets'
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

export default function AssetEditDialog({
  open,
  asset,
  attributes,
  workspaceId,
  assetTypeId,
  onClose,
  onSuccess,
}: AssetEditDialogProps) {
  const [editingAttribute, setEditingAttribute] = useState<AssetTypeAttribute | null>(null)
  const [value, setValue] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelectAttribute = (attr: AssetTypeAttribute) => {
    setEditingAttribute(attr)
    setValue(asset?.attributes?.[attr.apiKey] ?? null)
    setError(null)
  }

  const handleSave = async () => {
    if (!asset || !editingAttribute) return

    setLoading(true)
    setError(null)

    try {
      const response = await updateAssetAttributeValue(
        workspaceId,
        assetTypeId,
        asset.id,
        editingAttribute.id,
        value
      )
      setEditingAttribute(null)
      setValue(null)
      if (response.asset) {
        onSuccess(response.asset)
      } else {
        onSuccess(asset)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update attribute')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setEditingAttribute(null)
    setValue(null)
    setError(null)
    onClose()
  }

  // Get non-hidden attributes
  const editableAttributes = attributes.filter((attr) => !attr.isHidden)

  if (!asset) return null

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Asset Attributes</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {!editingAttribute ? (
            <>
              <Typography variant="body2" color="text.secondary">
                Select an attribute to edit:
              </Typography>
              <Stack spacing={1}>
                {editableAttributes.length === 0 ? (
                  <Typography variant="body2" color="text.disabled">
                    No editable attributes available
                  </Typography>
                ) : (
                  editableAttributes.map((attr) => (
                    <Button
                      key={attr.id}
                      variant="outlined"
                      fullWidth
                      onClick={() => handleSelectAttribute(attr)}
                      sx={{ justifyContent: 'flex-start', textAlign: 'left', p: 1.5 }}
                    >
                      <Box sx={{ width: '100%' }}>
                        <Typography variant="subtitle2">{attr.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {attr.attributeType}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          Current: <AttributeValueRenderer attribute={attr} value={asset.attributes?.[attr.apiKey]} maxLines={1} />
                        </Typography>
                      </Box>
                    </Button>
                  ))
                )}
              </Stack>
            </>
          ) : (
            <>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {editingAttribute.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {editingAttribute.description || 'No description'}
                </Typography>
              </Box>

              {editingAttribute.attributeType === 'boolean' ? (
                <FormControlLabel
                  control={
                    <Switch
                      checked={value === true}
                      onChange={(e) => setValue(e.target.checked)}
                    />
                  }
                  label={value ? 'Yes' : 'No'}
                />
              ) : editingAttribute.attributeType === 'number' ? (
                <TextField
                  type="number"
                  label="Value"
                  value={value ?? ''}
                  onChange={(e) => setValue(e.target.value === '' ? null : parseFloat(e.target.value))}
                  fullWidth
                  inputProps={{
                    step: editingAttribute.unit ? 0.01 : 1,
                  }}
                  helperText={editingAttribute.unit ? `Unit: ${editingAttribute.unit}` : undefined}
                />
              ) : editingAttribute.attributeType === 'date' ? (
                <TextField
                  type="date"
                  label="Value"
                  value={value ? value.split('T')[0] : ''}
                  onChange={(e) => setValue(e.target.value || null)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              ) : editingAttribute.attributeType === 'datetime' ? (
                <TextField
                  type="datetime-local"
                  label="Value"
                  value={value ? value.slice(0, 16) : ''}
                  onChange={(e) => setValue(e.target.value ? new Date(e.target.value).toISOString() : null)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              ) : editingAttribute.attributeType === 'json' ? (
                <TextField
                  label="Value (JSON)"
                  value={value ? JSON.stringify(value, null, 2) : ''}
                  onChange={(e) => {
                    try {
                      setValue(e.target.value ? JSON.parse(e.target.value) : null)
                    } catch {
                      // Keep invalid JSON as string for now
                    }
                  }}
                  fullWidth
                  multiline
                  rows={4}
                  error={value !== null && typeof value === 'string' && !value.startsWith('{') && !value.startsWith('[')}
                />
              ) : editingAttribute.attributeType === 'link' ? (
                <>
                  <TextField
                    label="URL"
                    value={
                      value && typeof value === 'object'
                        ? value.url || ''
                        : typeof value === 'string'
                          ? value
                          : ''
                    }
                    onChange={(e) =>
                      setValue(
                        typeof value === 'object'
                          ? { ...value, url: e.target.value }
                          : { url: e.target.value, text: '' }
                      )
                    }
                    fullWidth
                    type="url"
                  />
                  <TextField
                    label="Display Text (optional)"
                    value={
                      value && typeof value === 'object' ? value.text || '' : ''
                    }
                    onChange={(e) =>
                      setValue(
                        typeof value === 'object'
                          ? { ...value, text: e.target.value }
                          : { url: '', text: e.target.value }
                      )
                    }
                    fullWidth
                  />
                </>
              ) : (
                <TextField
                  label="Value"
                  value={value ?? ''}
                  onChange={(e) => setValue(e.target.value || null)}
                  fullWidth
                  multiline={editingAttribute.attributeType === 'text'}
                  rows={editingAttribute.attributeType === 'text' ? 3 : 1}
                />
              )}

              {editingAttribute.isRequired && !value && (
                <Alert severity="warning">This field is required</Alert>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          {editingAttribute ? 'Back' : 'Cancel'}
        </Button>
        {editingAttribute && (
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={loading || (editingAttribute.isRequired && !value)}
          >
            {loading ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
