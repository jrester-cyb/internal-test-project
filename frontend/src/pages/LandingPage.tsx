import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Typography, Paper } from '@mui/material'
import { Business as BusinessIcon } from '@mui/icons-material'
import { useOrganization } from '@app/contexts/OrganizationContext'

export default function LandingPage() {
  const navigate = useNavigate()
  const { organizations } = useOrganization()

  useEffect(() => {
    // If there are organizations, redirect to the first one
    if (organizations.length > 0) {
      navigate(`/organizations/${organizations[0].id}`, { replace: true })
    }
  }, [organizations, navigate])

  // Show landing page only if no organizations
  if (organizations.length > 0) {
    return null
  }

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      height="100%"
      width="100%"
      p={3}
    >
      <Paper
        elevation={0}
        sx={{
          p: 6,
          textAlign: 'center',
          maxWidth: 500,
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
        }}
      >
        <BusinessIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          No Organizations Available
        </Typography>
        <Typography variant="body1" color="text.secondary">
          You don't have access to any organizations yet. Please contact your administrator to get access.
        </Typography>
      </Paper>
    </Box>
  )
}
