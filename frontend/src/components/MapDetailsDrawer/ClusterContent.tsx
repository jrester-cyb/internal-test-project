import { useCallback, useMemo } from 'react'
import { Box, Skeleton, Chip, IconButton, List, ListItem, ListItemText, ListItemButton, Tooltip, Card, CardContent, Container, LinearProgress, Typography } from '@mui/material'
import { LocationOn as LocationIcon, OpenInNew as OpenInNewIcon, Place as PlaceIcon, Layers as LayersIcon, MyLocation as ZoomIcon } from '@mui/icons-material'
import type { Asset, Cluster } from '../../types'
import PvDrawer from '../PvDrawer'
import CopyableText from '../CopyableText'
import VirtualizedList from '../VirtualizedList'

export interface ClusterContentProps {
  isOpen: boolean
  onClose: () => void
  organizationId: string
  workspaceId: string
  cluster: Cluster
  assets: Asset[]
  loading: boolean
  loadingMore?: boolean
  totalCount?: number
  onAssetClick?: (asset: Asset) => void
  onZoomToAsset?: (asset: Asset) => void
  onLoadMore?: () => void
}

export default function ClusterContent({
  isOpen,
  onClose,
  organizationId,
  workspaceId,
  cluster,
  assets,
  loading,
  loadingMore,
  totalCount,
  onAssetClick,
  onZoomToAsset,
  onLoadMore
}: ClusterContentProps) {
  // Memoize callbacks to prevent VirtualizedList from re-rendering
  const getItemKey = useCallback((asset: Asset) => asset.id, [])

  const handleLoadMore = useMemo(() => {
    if (!onLoadMore) return undefined
    return async () => {
      onLoadMore()
      return { items: [], hasMore: false }
    }
  }, [onLoadMore])

  // Memoize the loading placeholder to prevent VirtualizedList re-renders
  const loadingPlaceholder = useMemo(() => (
    <ListItem disablePadding>
      <ListItemButton sx={{ py: 1.5 }}>
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Skeleton variant="text" width={120} height={24} />
              <Skeleton variant="rounded" width={80} height={24} />
            </Box>
          }
          secondary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
              <Skeleton variant="circular" width={14} height={14} />
              <Skeleton variant="text" width={100} height={16} />
            </Box>
          }
        />
      </ListItemButton>
    </ListItem>
  ), [])

  // Generate chip label text
  const getAssetCountLabel = () => {
    if (loading) return 'Loading...'
    if (totalCount && totalCount > assets.length) {
      return `${assets.length} / ${totalCount} Assets`
    }
    return `${assets.length} Assets`
  }

  return (
    <PvDrawer isOpen={isOpen} onClose={onClose}>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <Container maxWidth={false} sx={{ py: 2 }}>
          <Card sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', position: 'relative', overflow: 'hidden' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <Typography variant="h4" component="h1" sx={{ mb: 1, fontWeight: 'bold' }}>
                    Cluster
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <Chip
                      icon={<LayersIcon />}
                      label={getAssetCountLabel()}
                      size="small"
                      sx={{
                        bgcolor: 'primary.dark',
                        color: 'primary.contrastText',
                        '& .MuiChip-icon': { color: 'primary.contrastText' },
                        flexShrink: 0
                      }}
                    />
                    <Chip
                      icon={<PlaceIcon />}
                      label={
                        cluster.center.lat && cluster.center.lon
                          ? `${cluster.center.lat.toFixed(6)}, ${cluster.center.lon.toFixed(6)}`
                          : '--.------, --.------'
                      }
                      size="small"
                      sx={{
                        bgcolor: 'primary.dark',
                        color: 'primary.contrastText',
                        '& .MuiChip-icon': { color: 'primary.contrastText' },
                        flexShrink: 0
                      }}
                    />
                  </Box>
                </Box>
              </Box>
            </CardContent>
            {(loading || loadingMore) && (
              <LinearProgress
                color="secondary"
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0
                }}
              />
            )}
          </Card>
        </Container>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {loading ? (
            <List>
              {[1, 2, 3, 4, 5].map((i) => (
                <ListItem key={i} disablePadding>
                  <ListItemButton sx={{ py: 1.5 }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Skeleton variant="text" width={120} height={24} />
                          <Skeleton variant="rounded" width={80} height={24} />
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <Skeleton variant="circular" width={14} height={14} />
                          <Skeleton variant="text" width={100} height={16} />
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          ) : (
            <VirtualizedList
              items={assets}
              getItemKey={getItemKey}
              estimatedItemHeight={72}
              totalCount={totalCount}
              onLoadMore={handleLoadMore}
              loadingPlaceholder={loadingPlaceholder}
              renderItem={(asset) => (
                <ListItem
                  disablePadding
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {onZoomToAsset && (
                        <Tooltip title="Zoom to asset" arrow>
                          <IconButton
                            size="small"
                            onClick={() => onZoomToAsset(asset)}
                          >
                            <ZoomIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Open details page" arrow>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => window.open(`/organizations/${organizationId}/workspaces/${workspaceId}/asset-types/${asset.assetType}/assets/${asset.id}`, '_blank')}
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  }
                >
                  <ListItemButton
                    onClick={() => onAssetClick?.(asset)}
                    sx={{ py: 1.5, pr: onZoomToAsset ? 10 : 6 }}
                  >
                    <ListItemText
                      primary={
                        <CopyableText variant="subtitle2">
                          {asset.name}
                        </CopyableText>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Chip label={asset.assetTypeName || asset.assetType} size="small" variant="outlined" />
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <LocationIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="body2" color="text.secondary">
                              {asset.location ? `${asset.location.coordinates[1].toFixed(4)}, ${asset.location.coordinates[0].toFixed(4)}` : 'No location'}
                            </Typography>
                          </Box>
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              )}
            />
          )}
        </Box>
      </Box>
    </PvDrawer >
  )
}
