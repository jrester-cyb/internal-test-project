import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  Stack,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  IconButton,
  CircularProgress
} from '@mui/material'
import {
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Delete as DeleteIcon
} from '@mui/icons-material'
import type { AssetTypeAttribute, AssetTypeAttributeChoice } from '../types'
import { createAssetTypeAttributeChoice, deleteAssetTypeAttributeChoice, fetchAssetTypeAttributeChoices, reorderAssetTypeAttributeChoices } from '../api/assets'
import SimpleTable, { type ColumnDef } from './SimpleTable'

interface AttributeChoicesSectionProps {
  attribute: AssetTypeAttribute
  workspaceId: string
  assetTypeId: string
}

export default function AttributeChoicesSection({
  attribute,
  workspaceId,
  assetTypeId
}: Readonly<AttributeChoicesSectionProps>) {
  const [expanded, setExpanded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({ value: '', label: '' })
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

  const handleAddChoice = async () => {
    if (!formData.label) return

    try {
      const newChoice = await createAssetTypeAttributeChoice(
        workspaceId,
        assetTypeId,
        attribute.id,
        {
          value: formData.value || formData.label,
          label: formData.label,
          order: choices.length
        }
      )
      setChoices(prev => [...prev, newChoice])
      setDialogOpen(false)
      setFormData({ value: '', label: '' })
    } catch (error) {
      console.error('Failed to add choice:', error)
      alert('Failed to add choice')
    }
  }

  const handleDeleteChoice = async (choice: AssetTypeAttributeChoice) => {
    if (!confirm(`Are you sure you want to delete the choice "${choice.label}"?`)) return

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

    try {
      await reorderAssetTypeAttributeChoices(workspaceId, assetTypeId, attribute.id, updates)
    } catch (error) {
      console.error('Failed to reorder choices:', error)
      // Reload choices on error
      loadChoices()
    }
  }

  const columns: ColumnDef<AssetTypeAttributeChoice>[] = useMemo(() => [
    {
      key: 'label',
      header: 'Label',
      render: (choice: AssetTypeAttributeChoice) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {choice.label}
        </Typography>
      )
    },
    {
      key: 'value',
      header: 'Value',
      render: (choice: AssetTypeAttributeChoice) => (
        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
          {String(choice.value)}
        </Typography>
      )
    },
    {
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
    }
  ], [handleDeleteChoice])

  return (
    <>
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Box
          onClick={() => setExpanded(!expanded)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
            borderRadius: 1,
            mx: -1,
            px: 1
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
        </Box>
        <Collapse in={expanded}>
          <Box sx={{ mt: 1, height: 300 }}>
            {loading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <SimpleTable
                items={choices}
                columns={columns}
                emptyMessage="No choices defined"
                onReorder={handleReorder}
              />
            )}
          </Box>
        </Collapse>
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Choice</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Label"
              fullWidth
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              helperText="Display text for this choice"
            />
            <TextField
              label="Value"
              fullWidth
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              helperText="Value stored when selected (defaults to label if empty)"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddChoice} variant="contained" color="primary" disabled={!formData.label}>
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
