import { Container, Box } from '@mui/material'
import { Outlet } from 'react-router-dom'

export default function SettingsLayout() {
  return (
    <Container sx={{ py: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Outlet />
      </Box>
    </Container>
  )
}
