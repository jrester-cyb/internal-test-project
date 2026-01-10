import { Box, Typography, Paper, Button, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import type { Asset } from '../types'

interface AssetListProps {
  assets: Asset[]
  onAssetClick: (asset: Asset) => void
  loading: boolean
  currentPage?: number
  totalPages?: number
  totalCount?: number
  onPageChange?: (page: number) => void
}

export default function AssetList({ assets, onAssetClick, loading, currentPage = 1, totalPages = 1, totalCount = 0, onPageChange }: AssetListProps) {
  if (loading) {
    return (
      <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography color="text.secondary">Loading assets...</Typography>
        </Box>
      </Box>
    );
  }

  // Collect all unique attribute keys from all assets
  const attributeKeys: string[] = Array.from(
    assets.reduce((set: Set<string>, asset) => {
      if (asset.attributes && typeof asset.attributes === 'object' && !Array.isArray(asset.attributes)) {
        Object.keys(asset.attributes).forEach(key => set.add(key));
      }
      return set;
    }, new Set<string>())
  );

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'grey.50' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" component="h2">Assets</Typography>
          {totalCount > 0 && (
            <Typography color="text.secondary">Total: {totalCount}</Typography>
          )}
        </Box>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Location</TableCell>
                {attributeKeys.map(key => (
                  <TableCell key={key} sx={{ fontWeight: 600 }}>{key}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {assets.map(asset => (
                <TableRow key={asset.id} hover onClick={() => onAssetClick(asset)} style={{ cursor: 'pointer' }}>
                  <TableCell sx={{ color: '#000 !important', fontWeight: 600 }}>{asset.name}</TableCell>
                  <TableCell>{asset.assetTypeId}</TableCell>
                  <TableCell>
                    {asset.geometry && asset.geometry.type === "Point" && Array.isArray(asset.geometry.coordinates) && asset.geometry.coordinates.length === 2
                      ? `${asset.geometry.coordinates[1].toFixed(6)}, ${asset.geometry.coordinates[0].toFixed(6)}`
                      : asset.geometry && asset.geometry.type === "Polygon" && Array.isArray(asset.geometry.coordinates)
                        ? `Polygon (${Array.isArray(asset.geometry.coordinates[0]) ? asset.geometry.coordinates[0].length : 0} points)`
                        : ''}
                  </TableCell>
                  {attributeKeys.map(key => (
                    <TableCell key={key}>
                      {asset.attributes && typeof asset.attributes === 'object' && key in asset.attributes
                        ? (asset.attributes[key] !== null && typeof asset.attributes[key] === 'object')
                          ? JSON.stringify(asset.attributes[key])
                          : String(asset.attributes[key])
                        : ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {totalPages > 1 && onPageChange && (
          <Paper elevation={3} sx={{ borderTop: 1, borderColor: 'divider', p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                variant="outlined"
              >
                Previous
              </Button>
              <Typography variant="body2" color="text.secondary">
                Page {currentPage} of {totalPages}
              </Typography>
              <Button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                variant="outlined"
              >
                Next
              </Button>
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
}

