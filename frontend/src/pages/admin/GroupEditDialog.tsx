import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
} from '@mui/material'
import type { Group } from '../../types'
import { createGroup, updateGroup } from '../../api/groups'

interface GroupEditDialogProps {
  open: boolean
  group: Group | null
  onClose: () => void
  onSave: (group: Group) => void
}

export default function GroupEditDialog({ open, group, onClose, onSave }: GroupEditDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!group

  // Initialize form when group changes
  useEffect(() => {
    if (group) {
      setName(group.name)
      setDescription(group.description || '')
    } else {
      setName('')
      setDescription('')
    }
    setError(null)
  }, [group, open])

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Group name is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      let savedGroup: Group
      if (isEditing) {
        savedGroup = await updateGroup(group.id, {
          name: name.trim(),
          description: description.trim(),
        })
      } else {
        savedGroup = await createGroup({
          name: name.trim(),
          description: description.trim() || undefined,
        })
      }
      onSave(savedGroup)
    } catch (err: any) {
      console.error('Failed to save group:', err)
      setError(err.message || 'Failed to save group')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEditing ? 'Edit Group' : 'Create Group'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            required
            autoFocus
          />

          <TextField
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving}
        >
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Group'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
