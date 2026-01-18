import {
  Typography,
  Box,
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
import { useLoaderData } from 'react-router-dom'
import type { MFADevice, MFADevicesLoaderData } from '../../loaders/security'

export default function MFADevicesPage() {
  const { devices: mfaDevices } = useLoaderData() as MFADevicesLoaderData

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
