import { Box, Typography, Paper, Button, CircularProgress, Card, CardContent, CardActionArea } from '@mui/material'
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
    )
  }

  if (assets.length === 0) {
    return (
      <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">No assets found. Zoom in or click a cluster.</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'grey.50' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" component="h2">Assets</Typography>
          {totalCount > 0 && (
            <Typography color="text.secondary">Total: {totalCount}</Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {assets.map(asset => (
            <Card key={asset.id} sx={{ '&:hover': { boxShadow: 4 } }}>
              <CardActionArea onClick={() => onAssetClick(asset)} sx={{ p: 2 }}>
                <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
                  {asset.name}
                </Typography>
                {asset.geometry && asset.geometry.type === "Point" && Array.isArray(asset.geometry.coordinates) && asset.geometry.coordinates.length === 2 ? (
                  <Typography variant="body2" color="text.secondary">
                    {asset.geometry.coordinates[1].toFixed(6)}, {asset.geometry.coordinates[0].toFixed(6)}
                  </Typography>
                ) : asset.geometry && asset.geometry.type === "Polygon" && Array.isArray(asset.geometry.coordinates) ? (
                  <Typography variant="body2" color="text.secondary">
                    Polygon ({Array.isArray(asset.geometry.coordinates[0]) ? asset.geometry.coordinates[0].length : 0} points)
                  </Typography>
                ) : null}
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Box>

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
  )
}
