import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Grid,
  Container,
} from '@mui/material'
import { Folder as FolderIcon, Business as BusinessIcon } from '@mui/icons-material'
import { useOrganization } from '@app/contexts/OrganizationContext'
import { useEffect, useState } from 'react'
import { fetchWorkspaces } from '@app/api/assets'

interface Workspace {
  id: string
  name: string
  description?: string
  created_at: string
  organization: string
}

export default function OrganizationLandingPage() {
  const { organizationId } = useParams()
  const navigate = useNavigate()
  const { activeOrganization } = useOrganization()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadWorkspaces() {
      try {
        setLoading(true)
        const data = await fetchWorkspaces()
        const allWorkspaces = Array.isArray(data) ? data : data.results || []
        // Filter workspaces for this organization
        const orgWorkspaces = allWorkspaces.filter(w => w.organization === organizationId)
        setWorkspaces(orgWorkspaces)
      } catch (error) {
        console.error('Failed to load workspaces:', error)
      } finally {
        setLoading(false)
      }
    }
    loadWorkspaces()
  }, [organizationId])

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          Loading workspaces...
        </Typography>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <BusinessIcon sx={{ mr: 2, fontSize: 40, color: 'primary.main' }} />
        <Typography variant="h4" component="h1">
          {activeOrganization?.name || 'Organization'}
        </Typography>
      </Box>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Select a workspace to view its assets, maps, and configurations.
      </Typography>

      {workspaces.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <FolderIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No workspaces available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Contact your administrator to create a workspace for this organization.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {workspaces.map((workspace) => (
            <Grid item xs={12} sm={6} md={4} key={workspace.id}>
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
                  onClick={() => navigate(`/organizations/${workspace.organization}/workspaces/${workspace.id}/map`)}
                  sx={{ height: '100%' }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <FolderIcon sx={{ mr: 1, color: 'primary.main' }} />
                      <Typography variant="h6" component="h2">
                        {workspace.name}
                      </Typography>
                    </Box>
                    {workspace.description && (
                      <Typography variant="body2" color="text.secondary">
                        {workspace.description}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                      Created: {new Date(workspace.created_at).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  )
}
