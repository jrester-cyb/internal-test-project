import { useState, useEffect } from 'react'
import {
  Typography,
  Paper,
  Box,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Button,
  IconButton,
} from '@mui/material'
import {
  Security as SecurityIcon,
  Smartphone as SmartphoneIcon,
  Sms as SmsIcon,
  Email as EmailIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

interface MFADevice {
  id: string
  name: string
  type: 'app' | 'sms' | 'email'
  masked_destination: string | null
  confirmed_at: string
  last_used_at: string | null
  created_at: string
}

export default function SecuritySettingsPage() {
  const [mfaDevices, setMfaDevices] = useState<MFADevice[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchMfaDevices() {
      try {
        const response = await fetch('/api/auth/v2/mfa-devices/', { credentials: 'include' })
        if (!response.ok) throw new Error('Failed to fetch MFA devices')
        const data = await response.json()
        setMfaDevices(data)
      } catch (err) {
        console.error('Failed to load MFA devices', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMfaDevices()
  }, [])

  const getMfaDeviceIcon = (type: MFADevice['type']) => {
    switch (type) {
      case 'app':
        return <SmartphoneIcon />
      case 'sms':
        return <SmsIcon />
      case 'email':
        return <EmailIcon />
      default:
        return <SecurityIcon />
    }
  }

  const getMfaDeviceTypeLabel = (type: MFADevice['type']) => {
    switch (type) {
      case 'app':
        return 'Authenticator App'
      case 'sms':
        return 'SMS'
      case 'email':
        return 'Email'
      default:
        return type
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <IconButton onClick={() => navigate('/profile')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5">Security Settings</Typography>
        </Box>

        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <SecurityIcon sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant="h6">Multi-Factor Authentication</Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              size="small"
              disabled
            >
              Add Device
            </Button>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Multi-factor authentication adds an extra layer of security to your account by requiring
            a verification code in addition to your password.
          </Typography>

          {mfaDevices.length === 0 ? (
            <Box
              sx={{
                py: 4,
                textAlign: 'center',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                borderStyle: 'dashed',
              }}
            >
              <SecurityIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                No MFA devices configured.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Add a device to secure your account.
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {mfaDevices.map((device) => (
                <ListItem
                  key={device.id}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    mb: 1,
                    '&:last-child': { mb: 0 },
                  }}
                >
                  <ListItemIcon sx={{ color: 'text.secondary' }}>{getMfaDeviceIcon(device.type)}</ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {device.name}
                        <Chip
                          label={getMfaDeviceTypeLabel(device.type)}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                    }
                    secondary={
                      <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                        {device.masked_destination && (
                          <Typography component="span" variant="body2" color="text.secondary">
                            {device.masked_destination}
                          </Typography>
                        )}
                        <Typography component="span" variant="body2" color="text.secondary">
                          Added: {formatDate(device.created_at)} &bull; Last used: {formatDate(device.last_used_at)}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      </Box>
    </Box>
  )
}
