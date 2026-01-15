import { Container, Typography, Box } from '@mui/material'
import { useParams } from 'react-router-dom'
import { useOrganization } from '../contexts/OrganizationContext'

export default function OrganizationSettingsPage() {
  const { organizationId } = useParams()
  const { activeOrganization } = useOrganization()

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Organization Settings
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Manage settings for {activeOrganization?.name || 'this organization'}
      </Typography>

      <Box sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          Organization settings will be configured here.
        </Typography>
      </Box>
    </Container>
  )
}
