import { useState } from 'react'
import {
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Chip,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import {
  Security as SecurityIcon,
  Smartphone as SmartphoneIcon,
  Sms as SmsIcon,
  Email as EmailIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  ContentCopy as ContentCopyIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import { useLoaderData, useRevalidator } from 'react-router-dom'
import type { MFADevice, MFADevicesLoaderData } from '../../loaders/security'
import { authFetch } from '../../api/authFetch'

type EnrollmentStep = 'select' | 'totp' | 'sms-phone' | 'sms-verify'

interface TOTPSetupData {
  seed: string
  provisioningUri: string
  qrCode: string
  issuer: string
  accountName: string
}

export default function MFADevicesPage() {
  const { devices: mfaDevices } = useLoaderData() as MFADevicesLoaderData
  const revalidator = useRevalidator()

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deviceToDelete, setDeviceToDelete] = useState<MFADevice | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deviceToRename, setDeviceToRename] = useState<MFADevice | null>(null)
  const [newDeviceName, setNewDeviceName] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  // Enrollment dialog state
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false)
  const [enrollmentStep, setEnrollmentStep] = useState<EnrollmentStep>('select')
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null)

  // TOTP enrollment state
  const [totpSetup, setTotpSetup] = useState<TOTPSetupData | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [qrEnlarged, setQrEnlarged] = useState(false)

  // Device nickname state (shared across enrollment types)
  const [deviceNickname, setDeviceNickname] = useState('')

  // SMS enrollment state
  const [phoneNumber, setPhoneNumber] = useState('')
  const [smsDeviceId, setSmsDeviceId] = useState<string | null>(null)
  const [smsCode, setSmsCode] = useState('')

  const handleDeleteClick = (device: MFADevice) => {
    setDeviceToDelete(device)
    setDeleteDialogOpen(true)
  }

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false)
    setDeviceToDelete(null)
  }

  const handleDeleteConfirm = async () => {
    if (!deviceToDelete) return

    setIsDeleting(true)
    try {
      const response = await authFetch(`/api/auth/v2/mfa-devices/${deviceToDelete.id}/`, {
        method: 'DELETE',
      })
      if (response.ok) {
        revalidator.revalidate()
      }
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setDeviceToDelete(null)
    }
  }

  // Rename handlers
  const handleRenameClick = (device: MFADevice) => {
    setDeviceToRename(device)
    setNewDeviceName(device.name)
    setRenameError(null)
    setRenameDialogOpen(true)
  }

  const handleRenameCancel = () => {
    setRenameDialogOpen(false)
    setDeviceToRename(null)
    setNewDeviceName('')
    setRenameError(null)
  }

  const handleRenameConfirm = async () => {
    if (!deviceToRename || !newDeviceName.trim()) return

    setIsRenaming(true)
    setRenameError(null)
    try {
      const response = await authFetch(`/api/auth/v2/mfa-devices/${deviceToRename.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDeviceName.trim() }),
      })
      if (response.ok) {
        revalidator.revalidate()
        handleRenameCancel()
      } else {
        const error = await response.json()
        setRenameError(error.detail || 'Failed to rename device')
      }
    } catch {
      setRenameError('Network error')
    } finally {
      setIsRenaming(false)
    }
  }

  // Enrollment handlers
  const handleEnrollClick = () => {
    setEnrollDialogOpen(true)
    setEnrollmentStep('select')
    setEnrollmentError(null)
  }

  const handleEnrollClose = () => {
    setEnrollDialogOpen(false)
    setEnrollmentStep('select')
    setEnrollmentError(null)
    setTotpSetup(null)
    setTotpCode('')
    setDeviceNickname('')
    setPhoneNumber('')
    setSmsDeviceId(null)
    setSmsCode('')
  }

  const handleSelectTOTP = async () => {
    setIsEnrolling(true)
    setEnrollmentError(null)
    try {
      const response = await authFetch('/api/auth/v2/mfa-devices/enroll/setup/')
      if (response.ok) {
        const data = await response.json()
        setTotpSetup(data)
        setEnrollmentStep('totp')
      } else {
        const error = await response.json()
        setEnrollmentError(error.detail || 'Failed to start TOTP setup')
      }
    } catch {
      setEnrollmentError('Network error')
    } finally {
      setIsEnrolling(false)
    }
  }

  const handleSelectSMS = () => {
    setEnrollmentStep('sms-phone')
    setEnrollmentError(null)
  }

  const handleTOTPEnroll = async () => {
    if (!totpSetup || !totpCode) return

    setIsEnrolling(true)
    setEnrollmentError(null)
    try {
      const response = await authFetch('/api/auth/v2/mfa-devices/enroll/totp/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed: totpSetup.seed,
          code: totpCode,
          name: deviceNickname.trim() || undefined,
        }),
      })
      if (response.ok) {
        revalidator.revalidate()
        handleEnrollClose()
      } else {
        const error = await response.json()
        setEnrollmentError(error.detail || 'Invalid verification code')
      }
    } catch {
      setEnrollmentError('Network error')
    } finally {
      setIsEnrolling(false)
    }
  }

  const handleSMSInitiate = async () => {
    if (!phoneNumber) return

    setIsEnrolling(true)
    setEnrollmentError(null)
    try {
      const response = await authFetch('/api/auth/v2/mfa-devices/enroll/sms/initiate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phoneNumber,
          name: deviceNickname.trim() || undefined,
        }),
      })
      if (response.ok) {
        const data = await response.json()
        setSmsDeviceId(data.deviceId)
        setEnrollmentStep('sms-verify')
      } else {
        const error = await response.json()
        setEnrollmentError(error.detail || 'Failed to send verification code')
      }
    } catch {
      setEnrollmentError('Network error')
    } finally {
      setIsEnrolling(false)
    }
  }

  const handleSMSVerify = async () => {
    if (!smsDeviceId || !smsCode) return

    setIsEnrolling(true)
    setEnrollmentError(null)
    try {
      const response = await authFetch('/api/auth/v2/mfa-devices/enroll/sms/verify/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: smsDeviceId, code: smsCode }),
      })
      if (response.ok) {
        revalidator.revalidate()
        handleEnrollClose()
      } else {
        const error = await response.json()
        setEnrollmentError(error.detail || 'Invalid verification code')
      }
    } catch {
      setEnrollmentError('Network error')
    } finally {
      setIsEnrolling(false)
    }
  }

  const handleBack = () => {
    setEnrollmentError(null)
    if (enrollmentStep === 'totp' || enrollmentStep === 'sms-phone') {
      setEnrollmentStep('select')
      setTotpSetup(null)
      setTotpCode('')
      setPhoneNumber('')
    } else if (enrollmentStep === 'sms-verify') {
      setEnrollmentStep('sms-phone')
      setSmsCode('')
    }
  }

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
          onClick={handleEnrollClick}
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
                    {device.maskedDestination && (
                      <Typography component="span" variant="body2" color="text.secondary">
                        {device.maskedDestination}
                      </Typography>
                    )}
                    <Typography component="span" variant="body2" color="text.secondary">
                      Added: {formatDate(device.createdAt)} &bull; Last used: {formatDate(device.lastUsedAt)}
                    </Typography>
                  </Box>
                }
              />
              <IconButton
                aria-label="rename"
                onClick={() => handleRenameClick(device)}
                sx={{ color: 'text.secondary' }}
              >
                <EditIcon />
              </IconButton>
              <IconButton
                edge="end"
                aria-label="delete"
                onClick={() => handleDeleteClick(device)}
                sx={{ color: 'text.secondary' }}
              >
                <DeleteIcon />
              </IconButton>
            </ListItem>
          ))}
        </List>
      )}

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onClose={handleRenameCancel} maxWidth="xs" fullWidth>
        <DialogTitle>Rename Device</DialogTitle>
        <DialogContent>
          {renameError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {renameError}
            </Alert>
          )}
          <TextField
            label="Device Name"
            value={newDeviceName}
            onChange={(e) => setNewDeviceName(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRenameCancel} disabled={isRenaming}>
            Cancel
          </Button>
          <Button
            onClick={handleRenameConfirm}
            variant="contained"
            disabled={isRenaming || !newDeviceName.trim()}
          >
            {isRenaming ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Remove MFA Device</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to remove "{deviceToDelete?.name}"? You will no longer be able to
            use this device for two-factor authentication.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" disabled={isDeleting}>
            {isDeleting ? 'Removing...' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Enrollment Dialog */}
      <Dialog open={enrollDialogOpen} onClose={handleEnrollClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {enrollmentStep !== 'select' && (
            <IconButton size="small" onClick={handleBack} disabled={isEnrolling}>
              <ArrowBackIcon />
            </IconButton>
          )}
          {enrollmentStep === 'select' && 'Add MFA Device'}
          {enrollmentStep === 'totp' && 'Set Up Authenticator App'}
          {enrollmentStep === 'sms-phone' && 'Set Up SMS Verification'}
          {enrollmentStep === 'sms-verify' && 'Verify Phone Number'}
        </DialogTitle>
        <DialogContent>
          {enrollmentError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {enrollmentError}
            </Alert>
          )}

          {enrollmentStep === 'select' && (
            <List disablePadding>
              <ListItemButton
                onClick={handleSelectTOTP}
                disabled={isEnrolling}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  mb: 1,
                }}
              >
                <ListItemIcon>
                  <SmartphoneIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Authenticator App"
                  secondary="Use an app like Google Authenticator or Authy"
                />
                {isEnrolling && <CircularProgress size={20} />}
              </ListItemButton>
              <ListItemButton
                onClick={handleSelectSMS}
                disabled={isEnrolling}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <ListItemIcon>
                  <SmsIcon />
                </ListItemIcon>
                <ListItemText
                  primary="SMS"
                  secondary="Receive verification codes via text message"
                />
              </ListItemButton>
            </List>
          )}

          {enrollmentStep === 'totp' && totpSetup && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Scan this QR code with your authenticator app, or manually enter the secret key.
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  mb: 2,
                  p: 2,
                  borderRadius: 1,
                  position: 'relative',
                }}
              >
                <Box
                  component="img"
                  src={totpSetup.qrCode}
                  alt="QR Code"
                  style={{ width: 200, height: 200 }}
                  onClick={() => setQrEnlarged(true)}
                  sx={{
                    cursor: 'pointer',
                  }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Manual entry key:
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  bgcolor: 'action.hover',
                  p: 1,
                  borderRadius: 1,
                  mb: 2,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    flex: 1,
                  }}
                >
                  {totpSetup.seed}
                </Typography>
                <Tooltip title="Copy to clipboard" arrow placement="left">
                  <IconButton
                    size="small"
                    onClick={() => navigator.clipboard.writeText(totpSetup.seed)}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <TextField
                label="Device Nickname"
                value={deviceNickname}
                onChange={(e) => setDeviceNickname(e.target.value)}
                fullWidth
                placeholder="e.g., Work Phone, Personal"
                helperText="Optional - helps identify this device later"
                sx={{ mb: 2 }}
              />
              <TextField
                label="Verification Code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 6, inputMode: 'numeric', pattern: '[0-9]*' }}
                helperText="Enter the 6-digit code from your authenticator app"
              />
            </Box>
          )}

          {enrollmentStep === 'sms-phone' && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Enter your phone number to receive verification codes via SMS.
              </Typography>
              <TextField
                label="Phone Number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                fullWidth
                autoFocus
                placeholder="+1234567890"
                helperText="Enter in international format (e.g., +1234567890)"
                sx={{ mb: 2 }}
              />
              <TextField
                label="Device Nickname"
                value={deviceNickname}
                onChange={(e) => setDeviceNickname(e.target.value)}
                fullWidth
                placeholder="e.g., Work Phone, Personal"
                helperText="Optional - helps identify this device later"
              />
            </Box>
          )}

          {enrollmentStep === 'sms-verify' && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                We sent a verification code to {phoneNumber}. Enter it below.
              </Typography>
              <TextField
                label="Verification Code"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value)}
                fullWidth
                autoFocus
                inputProps={{ maxLength: 6, inputMode: 'numeric', pattern: '[0-9]*' }}
                helperText="Enter the 6-digit code from the SMS"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEnrollClose} disabled={isEnrolling}>
            Cancel
          </Button>
          {enrollmentStep === 'totp' && (
            <Button
              onClick={handleTOTPEnroll}
              variant="contained"
              disabled={isEnrolling || totpCode.length !== 6}
            >
              {isEnrolling ? 'Verifying...' : 'Verify & Add'}
            </Button>
          )}
          {enrollmentStep === 'sms-phone' && (
            <Button
              onClick={handleSMSInitiate}
              variant="contained"
              disabled={isEnrolling || !phoneNumber}
            >
              {isEnrolling ? 'Sending...' : 'Send Code'}
            </Button>
          )}
          {enrollmentStep === 'sms-verify' && (
            <Button
              onClick={handleSMSVerify}
              variant="contained"
              disabled={isEnrolling || smsCode.length !== 6}
            >
              {isEnrolling ? 'Verifying...' : 'Verify & Add'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Enlarged QR Code Dialog */}
      <Dialog open={qrEnlarged} onClose={() => setQrEnlarged(false)} maxWidth="md">
        <DialogContent sx={{ p: 2, bgcolor: 'white' }}>
          <IconButton onClick={() => setQrEnlarged(false)} sx={{
            position: 'absolute',
            top: 2,
            right: 2,
            color: 'grey.500', '&:hover': { color: 'grey.700' }
          }}>
            <CloseIcon />
          </IconButton>
          {totpSetup && (
            <Box
              component="img"
              src={totpSetup.qrCode}
              alt="QR Code"
              style={{ width: '100%', maxWidth: 600, height: 'auto' }}
            />
          )}
        </DialogContent>
      </Dialog >
    </>
  )
}
