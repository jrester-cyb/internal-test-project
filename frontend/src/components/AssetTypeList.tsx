import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import type { AssetType } from '../types'
import { Link } from 'react-router-dom';

interface AssetTypeListProps {
  assetTypes: AssetType[]
  onAssetTypeClick?: (assetType: AssetType) => void
}

export default function AssetTypeList({ assetTypes, onAssetTypeClick }: AssetTypeListProps) {
  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'grey.50' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" component="h2">Asset Types</Typography>
          <Typography color="text.secondary">Total: {assetTypes.length}</Typography>
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
              {assetTypes.map(assetType => (
                <TableRow
                  key={assetType.id}
                  hover
                  style={{ cursor: onAssetTypeClick ? 'pointer' : 'default' }}
                >
                  <TableCell sx={{ color: '#000 !important', fontWeight: 600 }}>
                    <Link to={`/assets/${assetType.id}`}
                      state={{
                        breadcrumb: assetType.name
                      }}>{assetType.name}</Link></TableCell>
                  <TableCell>{assetType.description || ''}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{assetType.id}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}