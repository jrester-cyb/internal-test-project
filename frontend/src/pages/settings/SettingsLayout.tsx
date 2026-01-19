import { Container, Box } from '@mui/material'
import { Outlet } from 'react-router-dom'

export default function SettingsLayout() {
  return (
    <Container maxWidth={false} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Outlet />
      </Box>
    </Container>
  )
}
