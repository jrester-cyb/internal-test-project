import { useState, useEffect } from 'react'
import {
  Typography,
  Box,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Button,
} from '@mui/material'
import {
  Security as SecurityIcon,
  Smartphone as SmartphoneIcon,
  Sms as SmsIcon,
  Email as EmailIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import { authFetch } from '../../api/authFetch'

interface MFADevice {
  id: string
  name: string
  type: 'app' | 'sms' | 'email'
  masked_destination: string | null
  confirmed_at: string
  last_used_at: string | null
  created_at: string
}

export default function MFADevicesPage() {
  const [mfaDevices, setMfaDevices] = useState<MFADevice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchMfaDevices() {
      try {
        const response = await authFetch('/api/auth/v2/mfa-devices/')
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
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Multi-factor authentication adds an extra layer of security to your account.
        </Typography>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          size="small"
          disabled
        >
          Add Device
        </Button>
      </Box>

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
    </>
  )
}
