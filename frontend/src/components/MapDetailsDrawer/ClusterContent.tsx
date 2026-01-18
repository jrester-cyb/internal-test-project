import { useCallback, useMemo } from 'react'
// useMemo used for loadingPlaceholder
import { Box, Skeleton, Chip, IconButton, List, ListItem, ListItemText, ListItemButton, Tooltip, Card, CardContent, Container, LinearProgress, Typography } from '@mui/material'
import { LocationOn as LocationIcon, OpenInNew as OpenInNewIcon, Place as PlaceIcon, Layers as LayersIcon, MyLocation as ZoomIcon, Share as ShareIcon } from '@mui/icons-material'
import type { Asset, Cluster } from '@app/types'
import CopyableText from '@app/components/CopyableText'
import InfiniteLoaderList from '@app/components/InfiniteLoaderList'

export interface ClusterContentProps {
  organizationId: string
  workspaceId?: string
  cluster: Cluster
  /** Map of index to asset for sparse data */
  assets: Map<number, Asset>
  loading: boolean
  loadingMore?: boolean
  totalCount: number
  onAssetClick?: (asset: Asset) => void
  onZoomToAsset?: (asset: Asset) => void
  /** Called when items at specific indices need to be loaded */
  onLoadRange?: (startIndex: number, endIndex: number) => void
}

export default function ClusterContent({
  organizationId,
  workspaceId,
  cluster,
  assets,
  loading,
  loadingMore,
  totalCount,
  onAssetClick,
  onZoomToAsset,
  onLoadRange,
}: ClusterContentProps) {
  // Memoize callbacks to prevent InfiniteLoaderList from re-rendering
  const getItemKey = useCallback((asset: Asset) => asset.id, [])

  // Memoize the loading placeholder to prevent InfiniteLoaderList re-renders
  const loadingPlaceholder = useMemo(() => (
    <ListItem disablePadding>
      <ListItemButton sx={{ py: 1.5, pr: onZoomToAsset ? 10 : 6 }}>
        <ListItemText
          primary={
            <Skeleton variant="text" width={140} height={24} />
          }
          secondary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <Skeleton variant="rounded" width={80} height={24} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Skeleton variant="circular" width={14} height={14} />
                <Skeleton variant="text" width={100} height={16} />
              </Box>
            </Box>
          }
        />
      </ListItemButton>
    </ListItem>
  ), [onZoomToAsset])

  // Format count with K suffix for large numbers
  const formatCount = (count: number): string => {
    if (count < 1000) return count.toString()
    if (count < 10000) return `${(count / 1000).toFixed(1)}k`
    if (count < 1000000) return `${Math.round(count / 1000)}k`
    return `${(count / 1000000).toFixed(1)}M`
  }

  // Generate chip label text
  const getAssetCountLabel = () => {
    if (loading) return 'Loading...'
    return `${formatCount(totalCount)} Assets`
  }

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
  }, [])

  return (
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
                <Tooltip title="Copy link to clipboard" arrow>
                  <IconButton
                    onClick={handleShare}
                    sx={{ color: 'primary.contrastText' }}
                  >
                    <ShareIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </CardContent>
            {loading && (
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
        <Container maxWidth={false} sx={{ flex: 1, overflow: 'hidden', px: { xs: 2, sm: 3 } }}>
          {loading ? (
            <List sx={{ height: '100%', overflow: 'hidden' }}>
              {Array.from({ length: 15 }, (_, i) => i + 1).map((i) => (
                <ListItem key={i} disablePadding>
                  <ListItemButton sx={{ py: 1.5, pr: onZoomToAsset ? 10 : 6 }}>
                    <ListItemText
                      primary={
                        <Skeleton variant="text" width={140} height={24} />
                      }
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Skeleton variant="rounded" width={80} height={24} />
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Skeleton variant="circular" width={14} height={14} />
                            <Skeleton variant="text" width={100} height={16} />
                          </Box>
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          ) : (
            <InfiniteLoaderList
              items={assets}
              getItemKey={getItemKey}
              estimatedItemHeight={72}
              totalCount={totalCount}
              onLoadRange={onLoadRange}
              isLoading={loadingMore}
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
                      <Tooltip title="Open asset details page" arrow>
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
                    disableRipple
                    disableTouchRipple
                  >
                    <ListItemText
                      primary={
                        <CopyableText variant="subtitle2">
                          {asset.name}
                        </CopyableText>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
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
        </Container>
      </Box>
  )
}
