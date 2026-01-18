import { Box, Paper, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

/**
 * Skeleton for AssetTypesPage - shows a table with loading rows
 */
export function AssetTypesPageSkeleton() {
  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Skeleton variant="text" width={200} height={40} sx={{ mb: 2 }} />
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Skeleton variant="text" width={150} height={32} />
            <Skeleton variant="text" width={80} height={24} />
          </Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton variant="text" width={120} /></TableCell>
                    <TableCell><Skeleton variant="text" width={200} /></TableCell>
                    <TableCell><Skeleton variant="text" width={280} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>
    </Box>
  )
}

/**
 * Skeleton for LibraryPage - shows breadcrumb and file list
 */
export function LibraryPageSkeleton() {
  return (
    <Box
      sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper sx={{ flexGrow: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header with breadcrumb skeleton */}
        <Box sx={{ px: 1, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Skeleton variant="circular" width={14} height={14} />
            <Skeleton variant="text" width={60} />
            <Typography sx={{ mx: 0.5 }}>/</Typography>
            <Skeleton variant="text" width={80} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Skeleton variant="rounded" width={180} height={32} />
            <Skeleton variant="rounded" width={64} height={32} />
          </Box>
        </Box>

        {/* File list skeleton */}
        <Box sx={{ flexGrow: 1, p: 1 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, px: 2 }}>
              <Skeleton variant="circular" width={24} height={24} />
              <Box sx={{ flexGrow: 1 }}>
                <Skeleton variant="text" width={`${60 + Math.random() * 30}%`} height={20} />
              </Box>
              <Skeleton variant="text" width={80} height={16} />
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  )
}

/**
 * Skeleton for MapPage - shows map placeholder with theme-aware background
 * Light mode: #aad3df (OpenStreetMap water color)
 * Dark mode: #1a1a1a (CartoDB dark background)
 */
export function MapPageSkeleton() {
  return (
    <Box
      sx={{
        flexGrow: 1,
        display: 'flex',
        height: '100%',
        minHeight: 0,
        // Match leaflet container background colors
        bgcolor: (theme) => theme.palette.mode === 'dark' ? '#1a1a1a' : '#aad3df',
      }}
    />
  )
}

/**
 * Generic page skeleton with customizable rows
 */
export function GenericPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Box sx={{ p: 3 }}>
      <Skeleton variant="text" width={200} height={40} sx={{ mb: 3 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <Box key={i} sx={{ mb: 2 }}>
          <Skeleton variant="text" width={`${50 + Math.random() * 40}%`} height={24} />
        </Box>
      ))}
    </Box>
  )
}
