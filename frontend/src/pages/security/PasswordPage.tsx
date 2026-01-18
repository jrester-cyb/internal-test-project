import { useState } from 'react'
import {
  Typography,
  Button,
  TextField,
  Stack,
  Alert,
} from '@mui/material'

export default function PasswordPage() {
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  const handlePasswordChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordData(prev => ({ ...prev, [field]: e.target.value }))
    setPasswordError(null)
    setPasswordSuccess(null)
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    if (passwordData.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }

    setPasswordSaving(true)
    try {
      // Placeholder - replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      setPasswordSuccess('Password changed successfully')
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPasswordError('Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Change your password to keep your account secure. We recommend using a strong, unique password.
      </Typography>

      {passwordError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {passwordError}
        </Alert>
      )}

      {passwordSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {passwordSuccess}
        </Alert>
      )}

      <form onSubmit={handlePasswordSubmit}>
        <Stack spacing={3} sx={{ maxWidth: 400 }}>
          <TextField
            label="Current Password"
            type="password"
            value={passwordData.currentPassword}
            onChange={handlePasswordChange('currentPassword')}
            fullWidth
            required
          />
          <TextField
            label="New Password"
            type="password"
            value={passwordData.newPassword}
            onChange={handlePasswordChange('newPassword')}
            fullWidth
            required
            helperText="Must be at least 8 characters"
          />
          <TextField
            label="Confirm New Password"
            type="password"
            value={passwordData.confirmPassword}
            onChange={handlePasswordChange('confirmPassword')}
            fullWidth
            required
          />
          <Button
            type="submit"
            variant="contained"
            disabled={passwordSaving}
            sx={{ alignSelf: 'flex-start' }}
          >
            {passwordSaving ? 'Changing...' : 'Change Password'}
          </Button>
        </Stack>
      </form>
    </>
  )
}
