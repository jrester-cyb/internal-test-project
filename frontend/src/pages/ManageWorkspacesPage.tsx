import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Grid2 as Grid,
  Container,
} from '@mui/material'
import { Folder as FolderIcon } from '@mui/icons-material'
import { useEffect, useState } from 'react'
import { fetchWorkspaces } from '../api/assets'
import { useOrganization } from '../contexts/OrganizationContext'

interface Workspace {
  id: string
  name: string
  description?: string
  created_at: string
  organization: string
}

export default function ManageWorkspacesPage() {
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

  const handleWorkspaceClick = (workspaceId: string) => {
    navigate(`/organizations/${organizationId}/workspaces/${workspaceId}/map`)
  }

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
      <Typography variant="h4" component="h1" gutterBottom>
        Manage Workspaces
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        View and manage workspaces for {activeOrganization?.name || 'this organization'}
      </Typography>

      {workspaces.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <FolderIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No workspaces available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create a workspace to get started.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {workspaces.map((workspace) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={workspace.id}>
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
                  onClick={() => handleWorkspaceClick(workspace.id)}
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
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {workspace.description}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
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
