import { Box, CircularProgress } from '@mui/material'

// This page should never actually render - the loader redirects to the map
// This is just a fallback loading state in case the redirect is slow
export default function OrganizationIndexPage() {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" height="100%" width="100%">
      <CircularProgress />
    </Box>
  )
}
