import { useLoaderData } from 'react-router-dom'
import { Box, Typography, Paper, Grid } from '@mui/material'
import type { Asset } from '../types'

export default function AssetDetailPage() {
  const asset = useLoaderData() as Asset

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom>
        {asset.name}
      </Typography>

      <Paper sx={{ p: 3, mt: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" color="text.secondary">
              Asset Type
            </Typography>
            <Typography variant="body1">
              {asset.assetTypeName || 'N/A'}
            </Typography>
          </Grid>

          {asset.location && (
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" color="text.secondary">
                Location
              </Typography>
              <Typography variant="body1">
                {asset.location.coordinates[1].toFixed(6)}, {asset.location.coordinates[0].toFixed(6)}
              </Typography>
            </Grid>
          )}

          {asset.attributes && Object.keys(asset.attributes).length > 0 && (
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Attributes
              </Typography>
              <Grid container spacing={2}>
                {Object.entries(asset.attributes).map(([key, value]) => (
                  <Grid item xs={12} sm={6} md={4} key={key}>
                    <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                      <Typography variant="caption" color="text.secondary">
                        {key}
                      </Typography>
                      <Typography variant="body2">
                        {value !== null && value !== undefined
                          ? (typeof value === 'object' ? JSON.stringify(value) : String(value))
                          : 'N/A'}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          )}
        </Grid>
      </Paper>
    </Box>
  )
}
