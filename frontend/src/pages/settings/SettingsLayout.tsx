import { Container, Box, Typography } from '@mui/material'
import { Outlet } from 'react-router-dom'

export default function SettingsLayout() {
  return (
    <Container sx={{ py: 4 }}>
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </Box>
    </Container>
  )
}
