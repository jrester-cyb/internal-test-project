import { Box, CircularProgress, Typography, List, ListItem, ListItemText, ListItemButton, Chip } from '@mui/material'
import { LocationOn as LocationIcon } from '@mui/icons-material'
import type { Asset, Cluster } from '../../types'
import PvDrawer from '../PvDrawer'

export interface ClusterContentProps {
  isOpen: boolean
  onClose: () => void
  organizationId: string
  workspaceId: string
  cluster: Cluster
  assets: Asset[]
  loading: boolean
}

export default function ClusterContent({
  isOpen,
  onClose,
  organizationId,
  workspaceId,
  cluster,
  assets,
  loading
}: ClusterContentProps) {
  return (
    <PvDrawer isOpen={isOpen} onClose={onClose}>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" component="h2">
              Cluster Assets ({assets.length})
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            H3 Index: {cluster.h3Index} • Center: {cluster.center.lat.toFixed(4)}, {cluster.center.lon.toFixed(4)}
          </Typography>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
              <CircularProgress />
            </Box>
          ) : (
            <List>
              {assets.map((asset) => (
                <ListItem key={asset.id} disablePadding>
                  <ListItemButton
                    onClick={() => window.open(`/organizations/${organizationId}/workspaces/${workspaceId}/asset-types/${asset.assetType}/assets/${asset.id}`, '_blank')}
                    sx={{ py: 1.5 }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle2">{asset.name}</Typography>
                          <Chip label={asset.assetType} size="small" variant="outlined" />
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <LocationIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                          <Typography variant="body2" color="text.secondary">
                            {asset.location ? `${asset.location.coordinates[1].toFixed(4)}, ${asset.location.coordinates[0].toFixed(4)}` : 'No location'}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Box>
    </PvDrawer>
  )
}
