import { useState, useRef, useEffect, useMemo } from 'react'
import { useLoaderData, useParams } from 'react-router-dom'
import { Box, Typography, Card, CardContent, CardHeader, Table, TableBody, TableCell, TableRow, Chip, Container, Grid, IconButton, Drawer, Divider } from '@mui/material'
import { Place as PlaceIcon, Category as CategoryIcon, Edit as EditIcon, Map as MapIcon, Share as ShareIcon, Download as DownloadIcon, Info as InfoIcon, Close as CloseIcon, ContentCopy as CloneIcon, VisibilityOff as VisibilityOffIcon } from '@mui/icons-material'
import { VariableSizeList as List } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import type { Asset, AssetTypeAttribute } from '../types'
import ActionButtons from '../components/ActionButtons'
import RelatedAssetsTree from '../components/RelatedAssetsTree'
import CopyableText from '../components/CopyableText'
import AttributeValueRenderer from '../components/AttributeValueRenderer'
import AttributeFilterPopover from '../components/AttributeFilterPopover'
import { fetchRelatedAssets, type RelatedAssetsResponse } from '../api/assets'

export default function AssetDetailPage() {
  const { asset, attributes } = useLoaderData() as { asset: Asset, attributes: AssetTypeAttribute[] }
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(1000)
  const headerRef = useRef<HTMLDivElement>(null)
  const [relatedAssets, setRelatedAssets] = useState<RelatedAssetsResponse | null>(null)
  const [relatedLoading, setRelatedLoading] = useState(true)
  const [relatedError, setRelatedError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  // Count hidden attributes
  const hiddenCount = attributes.filter(attr => attr.isHidden).length

  // Get all unique tags from attributes
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    attributes.forEach(attr => {
      attr.tags?.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [attributes])

  // Fetch related assets
  useEffect(() => {
    if (workspaceId && asset.id) {
      setRelatedLoading(true)
      setRelatedError(null)
      fetchRelatedAssets(workspaceId, asset.id)
        .then(setRelatedAssets)
        .catch((err) => {
          console.error('Failed to fetch related assets:', err)
          setRelatedError(err.message || 'Failed to load related assets')
        })
        .finally(() => setRelatedLoading(false))
    }
  }, [workspaceId, asset.id])

  // Track container width for responsive buttons
  useEffect(() => {
    const updateWidth = () => {
      if (headerRef.current) {
        setContainerWidth(headerRef.current.offsetWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const handleEdit = () => {
    // TODO: Implement edit functionality
    console.log('Edit asset:', asset.id)
  }

  const handleViewOnMap = () => {
    // TODO: Implement view on map functionality
    console.log('View on map:', asset.id)
  }

  const handleShare = () => {
    // TODO: Implement share functionality
    navigator.clipboard.writeText(window.location.href)
    console.log('Share asset:', asset.id)
  }

  const handleDownload = () => {
    // Download asset details as JSON
    const dataStr = JSON.stringify(asset, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${asset.name.replace(/\s+/g, '_')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const actions = [
    {
      label: 'Share',
      icon: <ShareIcon fontSize="small" />,
      onClick: handleShare,
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: 500 // Stays visible longest
    },
    {
      label: 'View on Map',
      icon: <MapIcon fontSize="small" />,
      onClick: handleViewOnMap,
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: 550 // Collapses second
    },
    {
      label: 'Edit',
      icon: <EditIcon fontSize="small" />,
      onClick: handleEdit,
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: 700 // Collapses first
    },
    {
      label: 'System Details',
      icon: <InfoIcon fontSize="small" />,
      onClick: () => setDetailsOpen(true),
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: Infinity // Always in menu
    },
    {
      label: 'Clone',
      icon: <CloneIcon fontSize="small" />,
      onClick: () => {
        // TODO: Implement clone functionality
        console.log('Clone asset:', asset.id)
      },
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: Infinity // Always in menu
    },
    {
      label: 'Download',
      icon: <DownloadIcon fontSize="small" />,
      onClick: handleDownload,
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: Infinity // Always in menu
    }
  ]

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Fixed Header */}
      <Container maxWidth={false} sx={{ pt: 3, pb: 1, flexShrink: 0 }}>
        <Card sx={{ bgcolor: 'primary.main' }}>
          <CardContent>
            <Box ref={headerRef} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <CopyableText
                  variant="h5"
                  component="h1"
                  sx={{ color: 'primary.contrastText' }}
                  iconColor="primary.contrastText"
                >
                  {asset.name}
                </CopyableText>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                  <Chip
                    icon={<CategoryIcon />}
                    label={asset.assetTypeName || 'Unknown Type'}
                    size="small"
                    sx={{
                      bgcolor: 'primary.dark',
                      color: 'primary.contrastText',
                      '& .MuiChip-icon': { color: 'primary.contrastText' }
                    }}
                  />
                  {asset.location && (
                    <Chip
                      icon={<PlaceIcon />}
                      label={`${asset.location.coordinates[1].toFixed(6)}, ${asset.location.coordinates[0].toFixed(6)}`}
                      size="small"
                      sx={{
                        bgcolor: 'primary.dark',
                        color: 'primary.contrastText',
                        '& .MuiChip-icon': { color: 'primary.contrastText' }
                      }}
                    />
                  )}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, color: 'primary.contrastText', alignItems: 'center' }}>
                <ActionButtons
                  actions={actions}
                  width={containerWidth}
                  menuAnchorEl={menuAnchorEl}
                  setMenuAnchorEl={setMenuAnchorEl}
                  size="small"
                  iconOnly
                />
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Container>

      {/* Scrollable Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Container maxWidth={false} sx={{ py: 3 }}>
          <Grid container spacing={3}>
            {/* First Row: Attributes, Asset Tree */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: 400, display: 'flex', flexDirection: 'column' }}>
                <CardHeader
                  title="Attributes"
                  action={
                    <AttributeFilterPopover
                      showHidden={showHidden}
                      onShowHiddenChange={setShowHidden}
                      selectedTags={selectedTags}
                      onSelectedTagsChange={setSelectedTags}
                      hiddenCount={hiddenCount}
                      availableTags={availableTags}
                    />
                  }
                />
                <CardContent sx={{ flex: 1, overflow: 'hidden', p: 0, position: 'relative' }}>
                  <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                    {(() => {
                      // Filter attributes based on showHidden toggle and selected tags
                      let displayAttributes = showHidden
                        ? attributes
                        : attributes.filter(attr => !attr.isHidden)

                      // Filter by selected tags (if any)
                      if (selectedTags.length > 0) {
                        displayAttributes = displayAttributes.filter(attr =>
                          attr.tags?.some(tag => selectedTags.includes(tag))
                        )
                      }

                      if (displayAttributes.length === 0) {
                        return (
                          <Box sx={{ p: 2 }}>
                            <Typography color="text.secondary" variant="body2">
                              No attributes
                            </Typography>
                          </Box>
                        )
                      }

                      const AttributeRow = ({ index, style }: { index: number, style: React.CSSProperties }) => {
                        const attr = displayAttributes[index]
                        const value = asset.attributes?.[attr.apiKey]
                        return (
                          <Box
                            style={style}
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                              px: 2,
                              py: 1,
                              '&:hover': { bgcolor: 'action.hover' }
                            }}
                          >
                            <Box sx={{ width: '35%', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {attr.isHidden && <VisibilityOffIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
                                <Typography variant="body2" fontWeight={600} noWrap title={attr.name}>{attr.name}</Typography>
                              </Box>
                              {attr.tags && attr.tags.length > 0 && (
                                <Typography variant="caption" color="text.secondary" noWrap title={attr.tags.join(', ')}>
                                  {attr.tags.join(', ')}
                                </Typography>
                              )}
                            </Box>
                            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                              <AttributeValueRenderer attribute={attr} value={value} maxLines={3} />
                            </Box>
                          </Box>
                        )
                      }

                      // Calculate row height based on content and attribute type
                      const getRowHeight = (index: number) => {
                        const attr = displayAttributes[index]
                        const value = asset.attributes?.[attr.apiKey]
                        const hasTags = attr.tags && attr.tags.length > 0
                        const tagHeight = hasTags ? 18 : 0
                        const padding = 16

                        if (value === null || value === undefined) {
                          return padding + 20 + tagHeight
                        }

                        // JSON has different sizing due to formatted display with background
                        if (attr.attributeType === 'json' || typeof value === 'object') {
                          const formatted = JSON.stringify(value, null, 2)
                          const lines = Math.min(3, formatted.split('\n').length)
                          return padding + (lines * 18) + 24 + tagHeight // 24 for padding in json box
                        }

                        // Boolean uses chips - fixed height
                        if (attr.attributeType === 'boolean') {
                          return padding + 24 + tagHeight
                        }

                        // Text - estimate lines based on length
                        const strValue = String(value)
                        const estimatedLines = Math.min(3, Math.ceil(strValue.length / 50))
                        return padding + (estimatedLines * 20) + tagHeight
                      }

                      const AttributeList = ({ height, width }: { height: number | undefined; width: number | undefined }) => (
                        <List
                          height={height || 300}
                          width={width || 400}
                          itemCount={displayAttributes.length}
                          itemSize={getRowHeight}
                        >
                          {AttributeRow}
                        </List>
                      )

                      return <AutoSizer ChildComponent={AttributeList} />
                    })()}
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: 400, display: 'flex', flexDirection: 'column' }}>
                <CardHeader title="Asset Tree" />
                <CardContent sx={{ flex: 1, overflow: 'auto' }}>
                  <RelatedAssetsTree
                    relatedAssets={relatedAssets!}
                    workspaceId={workspaceId!}
                    currentAsset={{
                      id: asset.id,
                      name: asset.name,
                      assetType: asset.assetType,
                      assetTypeName: asset.assetTypeName || '',
                      relatedUrl: '',
                      hasChildren: false,
                    }}
                    loading={relatedLoading}
                    error={relatedError}
                  />
                </CardContent>
              </Card>
            </Grid>

            {/* Second Row: Tasks, Files */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardHeader title="Tasks" />
                <CardContent>
                  <Typography color="text.secondary" variant="body2">
                    No tasks assigned
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardHeader title="Files" />
                <CardContent>
                  <Typography color="text.secondary" variant="body2">
                    No files attached
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Third Row: Timeline */}
            <Grid size={{ xs: 12 }}>
              <Card sx={{ height: '100%' }}>
                <CardHeader title="Timeline" />
                <CardContent>
                  <Typography color="text.secondary" variant="body2">
                    No activity yet
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Details Drawer */}
      <Drawer
        anchor="right"
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      >
        <Box sx={{ width: 400, p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">System Details</Typography>
            <IconButton onClick={() => setDetailsOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Divider sx={{ mb: 2 }} />

          <Table size="small">
            <TableBody>
              <TableRow>
                <TableCell sx={{ fontWeight: 500, color: 'text.secondary', border: 0, pl: 0 }}>ID</TableCell>
                <TableCell sx={{ border: 0, pr: 0 }}>
                  <CopyableText variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {asset.id}
                  </CopyableText>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 500, color: 'text.secondary', border: 0, pl: 0 }}>Asset Type ID</TableCell>
                <TableCell sx={{ border: 0, pr: 0 }}>
                  <CopyableText variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {asset.assetType}
                  </CopyableText>
                </TableCell>
              </TableRow>
              {asset.h3Index && (
                <TableRow>
                  <TableCell sx={{ fontWeight: 500, color: 'text.secondary', border: 0, pl: 0 }}>H3 Index</TableCell>
                  <TableCell sx={{ border: 0, pr: 0 }}>
                    <CopyableText variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {asset.h3Index}
                    </CopyableText>
                  </TableCell>
                </TableRow>
              )}
              {asset.parent && (
                <TableRow>
                  <TableCell sx={{ fontWeight: 500, color: 'text.secondary', border: 0, pl: 0 }}>Parent ID</TableCell>
                  <TableCell sx={{ border: 0, pr: 0 }}>
                    <CopyableText variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {asset.parent}
                    </CopyableText>
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell sx={{ fontWeight: 500, color: 'text.secondary', border: 0, pl: 0 }}>Created</TableCell>
                <TableCell sx={{ border: 0, pr: 0 }}>
                  <Typography variant="body2">
                    {asset.createdAt ? new Date(asset.createdAt).toLocaleString() : 'N/A'}
                  </Typography>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 500, color: 'text.secondary', border: 0, pl: 0 }}>Updated</TableCell>
                <TableCell sx={{ border: 0, pr: 0 }}>
                  <Typography variant="body2">
                    {asset.updatedAt ? new Date(asset.updatedAt).toLocaleString() : 'N/A'}
                  </Typography>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 500, color: 'text.secondary', border: 0, pl: 0 }}>API URL</TableCell>
                <TableCell sx={{ border: 0, pr: 0 }}>
                  <CopyableText variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {asset.apiUrl || `${window.location.origin}/api/assets/${asset.id}/`}
                  </CopyableText>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      </Drawer>
    </Box>
  )
}
