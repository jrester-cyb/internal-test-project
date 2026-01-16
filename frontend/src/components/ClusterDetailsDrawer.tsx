import { useState } from 'react'
import { Box, Typography, IconButton, List, ListItem, ListItemText, ListItemButton, CircularProgress, Chip } from '@mui/material'
import { Close as CloseIcon, LocationOn as LocationIcon } from '@mui/icons-material'
import PvDrawer from './PvDrawer'
import type { Asset, Cluster } from '../types'

interface ClusterDetailsDrawerProps {
  isOpen: boolean
  onClose: () => void
  cluster: Cluster | null
  assets: Asset[]
  loading: boolean
  organizationId: string
  workspaceId: string
}

export default function ClusterDetailsDrawer({
  isOpen,
  onClose,
  cluster,
  assets,
  loading,
  organizationId,
  workspaceId
}: ClusterDetailsDrawerProps) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)

  if (!cluster) {
    return null
  }

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

        {/* Selected Asset Details */}
        {selectedAsset && (
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle1" gutterBottom>
              {selectedAsset.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Type: {selectedAsset.assetType}
            </Typography>
            {selectedAsset.location && (
              <Typography variant="body2" color="text.secondary">
                Location: {selectedAsset.location.coordinates[1].toFixed(4)}, {selectedAsset.location.coordinates[0].toFixed(4)}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </PvDrawer>
  )
}