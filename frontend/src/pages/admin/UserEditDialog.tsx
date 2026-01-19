import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  FormControlLabel,
  Switch,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import type { User } from '../../types'
import { createUser, updateUser } from '../../api/users'

interface UserEditDialogProps {
  open: boolean
  user: User | null
  onClose: () => void
  onSave: (user: User) => void
}

export default function UserEditDialog({ open, user, onClose, onSave }: UserEditDialogProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!user

  // Initialize form when user changes
  useEffect(() => {
    if (user) {
      setEmail(user.email)
      setFirstName(user.firstName || '')
      setLastName(user.lastName || '')
      setPhoneNumber(user.phoneNumber || '')
      setIsActive(user.isActive)
      setPassword('')
    } else {
      setEmail('')
      setPassword('')
      setFirstName('')
      setLastName('')
      setPhoneNumber('')
      setIsActive(true)
    }
    setError(null)
    setShowPassword(false)
  }, [user, open])

  const handleSave = async () => {
    if (!email.trim()) {
      setError('Email is required')
      return
    }

    if (!isEditing && !password) {
      setError('Password is required for new users')
      return
    }

    if (!isEditing && password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setSaving(true)
    setError(null)

    try {
      let savedUser: User
      if (isEditing) {
        savedUser = await updateUser(user.id, {
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phoneNumber: phoneNumber.trim() || undefined,
          isActive,
        })
      } else {
        savedUser = await createUser({
          email: email.trim(),
          password,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          phoneNumber: phoneNumber.trim() || undefined,
        })
      }
      onSave(savedUser)
    } catch (err: any) {
      console.error('Failed to save user:', err)
      setError(err.message || 'Failed to save user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEditing ? 'Edit User' : 'Create User'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            fullWidth
            required
            autoFocus={!isEditing}
          />

          {!isEditing && (
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              fullWidth
              required
              helperText="Must be at least 8 characters"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="First Name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              fullWidth
            />
            <TextField
              label="Last Name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              fullWidth
            />
          </Box>

          <TextField
            label="Phone Number"
            value={phoneNumber}
            onChange={e => setPhoneNumber(e.target.value)}
            fullWidth
          />

          {isEditing && (
            <Box sx={{ mt: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                  />
                }
                label="Active"
              />
            </Box>
          )}
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
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create User'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
