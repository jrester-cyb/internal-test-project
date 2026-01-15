import { useLoaderData, Link } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Grid,
  Container,
} from '@mui/material'
import { Folder as FolderIcon } from '@mui/icons-material'

interface Workspace {
  id: string
  name: string
  description?: string
  created_at: string
  organization: string
}

export default function WorkspacesPage() {
  const workspaces = useLoaderData() as Workspace[]

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Select a Workspace
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Choose a workspace to view its assets, maps, and configurations.
      </Typography>

      {workspaces.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <FolderIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No workspaces available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Contact your administrator to get access to a workspace.
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
                  component={Link}
                  to={`/organizations/${workspace.organization}/workspaces/${workspace.id}`}
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
