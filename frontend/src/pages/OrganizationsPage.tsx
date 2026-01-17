import { useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Grid,
  Container,
} from '@mui/material'
import { Business as BusinessIcon } from '@mui/icons-material'
import { useOrganization } from '@app/contexts/OrganizationContext'
import { useEffect, useState } from 'react'
import { fetchWorkspaces } from '@app/api/assets'

interface Workspace {
  id: string
  name: string
  organization: string
}

export default function OrganizationsPage() {
  const navigate = useNavigate()
  const { organizations, setActiveOrganization } = useOrganization()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadWorkspaces() {
      try {
        setLoading(true)
        const data = await fetchWorkspaces()
        setWorkspaces(Array.isArray(data) ? data : data.results || [])
      } catch (error) {
        console.error('Failed to load workspaces:', error)
      } finally {
        setLoading(false)
      }
    }
    loadWorkspaces()
  }, [])

  const getWorkspaceCount = (orgId: string) => {
    return workspaces.filter(w => w.organization === orgId).length
  }

  const handleOrganizationClick = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId)
    if (org) {
      setActiveOrganization(org)
      // Navigate to organization global map view
      navigate(`/organizations/${orgId}/map`)
    }
  }

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          Loading organizations...
        </Typography>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Select an Organization
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Choose an organization to access its workspaces and assets.
      </Typography>

      {organizations.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <BusinessIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No organizations available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Contact your administrator to get access to an organization.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {organizations.map((org) => {
            const workspaceCount = getWorkspaceCount(org.id)
            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={org.id}>
                <Card
                  elevation={2}
                  sx={{
                    height: '100%',
                    '&:hover': {
                      elevation: 8,
                      transform: 'translateY(-2px)',
                      transition: 'all 0.2s ease-in-out',
                    }
                  }}
                >
                  <CardActionArea
                    onClick={() => handleOrganizationClick(org.id)}
                    sx={{ height: '100%' }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <BusinessIcon sx={{ mr: 1, color: 'primary.main' }} />
                        <Typography variant="h6" component="h2">
                          {org.name}
                        </Typography>
                      </Box>
                      {org.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {org.description}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {workspaceCount} {workspaceCount === 1 ? 'workspace' : 'workspaces'}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}
    </Container>
  )
}
