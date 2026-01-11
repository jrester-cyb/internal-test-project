import { Box, Typography, Paper, Container } from '@mui/material'
import { useParams } from 'react-router-dom'

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useParams()

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Workspace Settings
      </Typography>
      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography variant="body1" color="text.secondary">
          Workspace settings and configuration options will be available here.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Workspace ID: {workspaceId}
        </Typography>
      </Paper>
    </Container>
  )
}
