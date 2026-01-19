import { Box, Typography, Paper } from '@mui/material'

export default function OrganizationsPage() {
  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h1" fontWeight={600}>
          Organizations
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Manage all organizations in the instance
        </Typography>
      </Box>

      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          Organization management coming soon
        </Typography>
      </Paper>
    </Box>
  )
}
