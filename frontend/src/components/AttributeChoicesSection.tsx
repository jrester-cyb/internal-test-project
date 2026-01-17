import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  IconButton,
  CircularProgress,
  Collapse,
  InputAdornment
} from '@mui/material'
import {
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIndicatorIcon
} from '@mui/icons-material'
import type { AssetTypeAttribute, AssetTypeAttributeChoice } from '@app/types'
import { createAssetTypeAttributeChoice, deleteAssetTypeAttributeChoice, fetchAssetTypeAttributeChoices, reorderAssetTypeAttributeChoices } from '@app/api/assets'
import SimpleTable, { type ColumnDef } from '@app/components/SimpleTable'
import { JsonRenderer, DateRenderer, LinkRenderer, NumberRenderer, TextRenderer } from '@app/components/AttributeValueRenderer'
import JsonEditor from '@app/components/JsonEditor'

interface AttributeChoicesSectionProps {
  attribute: AssetTypeAttribute
  workspaceId: string
  assetTypeId: string
  expanded?: boolean
  onToggleExpanded?: () => void
  dragHandleProps?: Record<string, unknown>
  readOnly?: boolean
}

export default function AttributeChoicesSection({
  attribute,
  workspaceId,
  assetTypeId,
  expanded: controlledExpanded,
  onToggleExpanded,
  dragHandleProps,
  readOnly = false
}: Readonly<AttributeChoicesSectionProps>) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const expanded = controlledExpanded ?? internalExpanded
  const toggleExpanded = onToggleExpanded ?? (() => setInternalExpanded(prev => !prev))

  const [dialogOpen, setDialogOpen] = useState(false)
  const [formValue, setFormValue] = useState<string>('')
  const [formLinkLabel, setFormLinkLabel] = useState<string>('')
  const [formJsonValue, setFormJsonValue] = useState<{ json: any; rawJson: string } | undefined>(undefined)
  const [choices, setChoices] = useState<AssetTypeAttributeChoice[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Load choices when expanded for the first time
  useEffect(() => {
    if (expanded && !loaded) {
      loadChoices()
    }
  }, [expanded])

  // Reset when attribute changes
  useEffect(() => {
    setChoices([])
    setLoaded(false)
    if (expanded) {
      loadChoices()
    }
  }, [attribute.id])

  const loadChoices = async () => {
    setLoading(true)
    try {
      const fetchedChoices = await fetchAssetTypeAttributeChoices(workspaceId, assetTypeId, attribute.id)
      setChoices(fetchedChoices)
      setLoaded(true)
    } catch (error) {
      console.error('Failed to load choices:', error)
    } finally {
      setLoading(false)
    }
  }

  // Convert form value to appropriate type for the attribute
  const getTypedValue = () => {
    if (attribute.attributeType === 'number') {
      return Number.parseFloat(formValue)
    }
    if (attribute.attributeType === 'json') {
      return formJsonValue?.json
    }
    if (attribute.attributeType === 'link') {
      return {
        url: formValue,
        text: formLinkLabel || formValue
      }
    }
    return formValue
  }

  const isFormValid = () => {
    if (attribute.attributeType === 'number') {
      return formValue !== '' && !Number.isNaN(Number.parseFloat(formValue))
    }
    if (attribute.attributeType === 'json') {
      return formJsonValue?.json !== undefined && formJsonValue?.json !== null
    }
    if (attribute.attributeType === 'link') {
      return formValue !== '' // URL is required, label is optional
    }
    return formValue !== ''
  }

  const resetForm = () => {
    setFormValue('')
    setFormLinkLabel('')
    setFormJsonValue(undefined)
  }

  const handleAddChoice = async () => {
    if (!isFormValid()) return

    try {
      const newChoice = await createAssetTypeAttributeChoice(
        workspaceId,
        assetTypeId,
        attribute.id,
        {
          value: getTypedValue(),
          order: choices.length
        }
      )
      setChoices(prev => [...prev, newChoice])
      setDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error('Failed to add choice:', error)
      alert('Failed to add choice')
    }
  }

  const handleDeleteChoice = async (choice: AssetTypeAttributeChoice) => {
    const displayValue = typeof choice.value === 'object' ? JSON.stringify(choice.value) : String(choice.value)
    if (!confirm(`Are you sure you want to delete the choice "${displayValue}"?`)) return

    try {
      await deleteAssetTypeAttributeChoice(workspaceId, assetTypeId, attribute.id, choice.id)
      setChoices(prev => prev.filter(c => c.id !== choice.id))
    } catch (error) {
      console.error('Failed to delete choice:', error)
      alert('Failed to delete choice')
    }
  }

  const handleReorder = async (reorderedChoices: AssetTypeAttributeChoice[]) => {
    // Optimistically update UI
    setChoices(reorderedChoices)

    // Build updates array with new order values
    const updates = reorderedChoices.map((choice, index) => ({
      id: choice.id,
      order: index
    }))

    console.log('Reordering choices:', { workspaceId, assetTypeId, attributeId: attribute.id, updates })

    try {
      await reorderAssetTypeAttributeChoices(workspaceId, assetTypeId, attribute.id, updates)
    } catch (error) {
      console.error('Failed to reorder choices:', error)
      // Reload choices on error
      loadChoices()
    }
  }

  // Render choice value based on attribute type
  const renderChoiceValue = (choice: AssetTypeAttributeChoice) => {
    const value = choice.value

    switch (attribute.attributeType) {
      case 'number':
        return <NumberRenderer value={value} unit={attribute.unit} showCopyButton={false} compact />
      case 'date':
        return <DateRenderer value={value} includeTime={false} showCopyButton={false} compact />
      case 'datetime':
        return <DateRenderer value={value} includeTime showCopyButton={false} compact />
      case 'json':
        return <JsonRenderer value={value} maxLines={1} />
      case 'link':
        return <LinkRenderer value={value} showCopyButton={false} compact />
      case 'text':
      default:
        return <TextRenderer value={String(value)} maxLines={1} showCopyButton={false} compact />
    }
  }

  const columns: ColumnDef<AssetTypeAttributeChoice>[] = useMemo(() => [
    {
      key: 'value',
      header: 'Value',
      render: (choice: AssetTypeAttributeChoice) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {choice.color && (
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: choice.color,
                flexShrink: 0,
              }}
            />
          )}
          {renderChoiceValue(choice)}
        </Box>
      )
    },
    ...(!readOnly ? [{
      key: 'actions',
      header: '',
      width: 48,
      render: (choice: AssetTypeAttributeChoice) => (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteChoice(choice)
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      )
    }] : [])
  ], [handleDeleteChoice, readOnly, attribute.attributeType, attribute.unit])

  return (
    <>
      <Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: 1,
            mx: -1,
            px: 1
          }}
        >
          {dragHandleProps && (
            <Box
              {...dragHandleProps}
              sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' }, display: 'flex', alignItems: 'center', mr: 0.5 }}
            >
              <DragIndicatorIcon fontSize="small" color="action" />
            </Box>
          )}
          <Box
            onClick={(e) => {
              e.stopPropagation()
              toggleExpanded()
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              flexGrow: 1,
            }}
          >
            {expanded ? (
              <ExpandLessIcon fontSize="small" color="action" />
            ) : (
              <ExpandMoreIcon fontSize="small" color="action" />
            )}
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, ml: 0.5, flexGrow: 1 }}>
              Choices {loaded ? `(${choices.length})` : ''}
            </Typography>
          </Box>
          {!readOnly && attribute.attributeType !== 'boolean' && (
            <IconButton
              size="small"
              color="primary"
              onClick={(e) => {
                e.stopPropagation()
                setDialogOpen(true)
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
        <Collapse in={expanded}>
          <Box sx={{ height: 300, mt: 1, display: 'flex', flexDirection: 'column' }}>
            {attribute.attributeType === 'boolean' ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  Choices are not available for Boolean attributes
                </Typography>
              </Box>
            ) : loading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <SimpleTable
                items={choices}
                columns={columns}
                emptyMessage="No choices defined"
                onReorder={readOnly ? undefined : handleReorder}
              />
            )}
          </Box>
        </Collapse>
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth={attribute.attributeType === 'json' ? 'sm' : 'xs'} fullWidth>
        <DialogTitle>Add Choice</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {attribute.attributeType === 'number' ? (
              <TextField
                label="Value"
                fullWidth
                type="number"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                InputProps={attribute.unit ? {
                  endAdornment: <InputAdornment position="end">{attribute.unit}</InputAdornment>
                } : undefined}
                helperText="Number value for this choice"
              />
            ) : attribute.attributeType === 'date' ? (
              <TextField
                label="Value"
                fullWidth
                type="date"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText="Date value for this choice"
              />
            ) : attribute.attributeType === 'datetime' ? (
              <TextField
                label="Value"
                fullWidth
                type="datetime-local"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText="Date and time value for this choice"
              />
            ) : attribute.attributeType === 'json' ? (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  JSON Value
                </Typography>
                <JsonEditor
                  value={formJsonValue}
                  onChange={(val) => setFormJsonValue(val)}
                  placeholder="Enter JSON value..."
                />
              </Box>
            ) : attribute.attributeType === 'link' ? (
              <>
                <TextField
                  label="URL"
                  fullWidth
                  type="url"
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  helperText="URL for this choice"
                />
                <TextField
                  label="Label"
                  fullWidth
                  value={formLinkLabel}
                  onChange={(e) => setFormLinkLabel(e.target.value)}
                  helperText="Display text (optional, defaults to URL)"
                />
              </>
            ) : (
              <TextField
                label="Value"
                fullWidth
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                helperText="Text value for this choice"
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddChoice} variant="contained" color="primary" disabled={!isFormValid()}>
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
