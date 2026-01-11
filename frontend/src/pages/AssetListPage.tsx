import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material'
import type { Asset } from '../types'
import { useLoaderData } from 'react-router-dom'


export default function AssetListPage() {
  const data = useLoaderData() as { assets: Asset[], assetType?: any };
  const assets = data.assets || data as Asset[]; // Handle both old and new format

  const formatCoordinates = (coordinates: number[]) => {
    if (coordinates.length >= 2) {
      return `${coordinates[1].toFixed(6)}, ${coordinates[0].toFixed(6)}`
    }
    return 'N/A'
  }

  const getGeometryType = (geometry: any) => {
    return geometry?.type || 'Unknown'
  }

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'grey.50' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" component="h2">Assets</Typography>
          <Typography color="text.secondary">Total: {assets.length}</Typography>
        </Box>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Asset Type ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Geometry Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Coordinates</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>H3 Index</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assets.map(asset => (
                <TableRow
                  key={asset.id}
                  hover
                >
                  <TableCell sx={{ color: '#000 !important', fontWeight: 600 }}>{asset.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={asset.assetTypeId}
                      size="small"
                      variant="outlined"
                      sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={getGeometryType(asset.geometry)}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {formatCoordinates(asset.geometry?.coordinates || [])}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {asset.h3Index || 'N/A'}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{asset.id}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {assets.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              No assets found
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
