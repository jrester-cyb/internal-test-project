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
import type { Organization } from '../../types'
import { createOrganization, updateOrganization } from '../../api/organizations'

interface OrganizationEditDialogProps {
  open: boolean
  organization: Organization | null
  onClose: () => void
  onSave: (organization: Organization) => void
}

export default function OrganizationEditDialog({
  open,
  organization,
  onClose,
  onSave,
}: OrganizationEditDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!organization

  // Initialize form when organization changes
  useEffect(() => {
    if (organization) {
      setName(organization.name)
      setDescription(organization.description || '')
    } else {
      setName('')
      setDescription('')
    }
    setError(null)
  }, [organization, open])

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Organization name is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      let savedOrganization: Organization
      if (isEditing) {
        savedOrganization = await updateOrganization(organization.id, {
          name: name.trim(),
          description: description.trim(),
        })
      } else {
        savedOrganization = await createOrganization({
          name: name.trim(),
          description: description.trim() || undefined,
        })
      }
      onSave(savedOrganization)
    } catch (err: any) {
      console.error('Failed to save organization:', err)
      setError(err.message || 'Failed to save organization')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEditing ? 'Edit Organization' : 'Create Organization'}
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
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
          />

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Organization'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
