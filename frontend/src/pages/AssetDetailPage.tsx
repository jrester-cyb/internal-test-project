import { useState, useRef, useEffect, useMemo } from 'react'
import { useLoaderData, useParams } from 'react-router-dom'
import { Box, Typography, Card, CardContent, CardHeader, Table, TableBody, TableCell, TableRow, Chip, Container, Grid, IconButton, Drawer, Divider } from '@mui/material'
import { Place as PlaceIcon, Category as CategoryIcon, Edit as EditIcon, Map as MapIcon, Share as ShareIcon, Download as DownloadIcon, Info as InfoIcon, Close as CloseIcon, ContentCopy as CloneIcon, VisibilityOff as VisibilityOffIcon, FilterAlt as FilterIcon, Article as ArticleIcon } from '@mui/icons-material'
import { VariableSizeList as List } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import type { Asset, AssetTypeAttribute } from '../types'
import ActionButtons from '../components/ActionButtons'
import RelatedAssetsTree from '../components/RelatedAssetsTree'
import CopyableText from '../components/CopyableText'
import TruncatedText from '../components/TruncatedText'
import AttributeValueRenderer from '../components/AttributeValueRenderer'
import AttributeFilterPopover from '../components/AttributeFilterPopover'
import TagsDisplay from '../components/TagsDisplay'
import { AssetAuditLogSection } from '../components/AssetAuditLogSection'
import AssetEditDialog from '../components/AssetEditDialog'
import { fetchRelatedAssets, type RelatedAssetsResponse } from '../api/assets'

export default function AssetDetailPage() {
  const { asset, attributes } = useLoaderData() as { asset: Asset, attributes: AssetTypeAttribute[] }
  const { workspaceId, assetTypeId } = useParams<{ workspaceId: string; assetTypeId: string }>()
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(1000)
  const headerRef = useRef<HTMLDivElement>(null)
  const [relatedAssets, setRelatedAssets] = useState<RelatedAssetsResponse | null>(null)
  const [relatedLoading, setRelatedLoading] = useState(true)
  const [relatedError, setRelatedError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [excludedScopes, setExcludedScopes] = useState<string[]>([])
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [currentAsset, setCurrentAsset] = useState<Asset>(asset)
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
    setEditDialogOpen(true)
  }

  const handleEditDialogClose = () => {
    setEditDialogOpen(false)
  }

  const handleEditSuccess = (updatedAsset: Asset) => {
    setEditDialogOpen(false)
    setCurrentAsset(updatedAsset)
  }

  const handleViewOnMap = () => {
    // TODO: Implement view on map functionality
    console.debug('View on map:', asset.id)
  }

  const handleShare = () => {
    // TODO: Implement share functionality
    navigator.clipboard.writeText(window.location.href)
    console.debug('Share asset:', asset.id)
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
        console.debug('Clone asset:', asset.id)
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
                  {currentAsset.name}
                </CopyableText>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                  <Chip
                    icon={<CategoryIcon />}
                    label={currentAsset.assetTypeName || 'Unknown Type'}
                    size="small"
                    sx={{
                      bgcolor: 'primary.dark',
                      color: 'primary.contrastText',
                      '& .MuiChip-icon': { color: 'primary.contrastText' }
                    }}
                  />
                  {currentAsset.location && (
                    <Chip
                      icon={<PlaceIcon />}
                      label={`${currentAsset.location.coordinates[1].toFixed(6)}, ${currentAsset.location.coordinates[0].toFixed(6)}`}
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
                      selectedTypes={selectedTypes}
                      onSelectedTypesChange={setSelectedTypes}
                      excludedScopes={excludedScopes}
                      onExcludedScopesChange={setExcludedScopes}
                      showScopeFilter={true}
                      hiddenCount={hiddenCount}
                      availableTags={availableTags}
                      showTypeFilter={true}
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

                      // Filter by selected types (if any)
                      if (selectedTypes.length > 0) {
                        displayAttributes = displayAttributes.filter(attr =>
                          attr.attributeType && selectedTypes.includes(attr.attributeType)
                        )
                      }

                      // Filter by excluded scopes (if any)
                      if (excludedScopes.length > 0) {
                        displayAttributes = displayAttributes.filter(attr => {
                          const scope = attr.scope || 'global'
                          return !excludedScopes.includes(scope)
                        })
                      }

                      if (displayAttributes.length === 0) {
                        // Determine why there are no attributes to show a helpful message
                        let message = 'No attributes'
                        let icon = <ArticleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />

                        if (attributes.length === 0) {
                          message = 'No attributes'
                          icon = <ArticleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        } else if (attributes.every(attr => attr.isHidden) && !showHidden) {
                          message = 'All attributes are hidden for this asset type'
                          icon = <VisibilityOffIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        } else if (selectedTags.length > 0 || selectedTypes.length > 0 || excludedScopes.length > 0) {
                          message = 'No attributes match the current filters'
                          icon = <FilterIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        }

                        return (
                          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <Typography color="text.secondary" variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                              {icon}
                              {message}
                            </Typography>
                          </Box>
                        )
                      }

                      const AttributeRow = ({ index, style }: { index: number, style: React.CSSProperties }) => {
                        const attr = displayAttributes[index]
                        const value = currentAsset.attributes?.[attr.apiKey]
                        return (
                          <Box
                            style={style}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                              px: 2,
                              py: 1,
                              '&:hover': { bgcolor: 'action.hover' }
                            }}
                          >
                            <Box sx={{ width: '35%', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', pr: 3 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {attr.isHidden && <VisibilityOffIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
                                <Typography variant="body2" fontWeight={600} noWrap title={attr.name}>{attr.name}</Typography>
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                <Chip
                                  label={attr.scope === 'local' ? 'Local' : attr.scope === 'override' ? 'Override' : 'Global'}
                                  size="small"
                                  variant={excludedScopes.includes(attr.scope || 'global') ? 'outlined' : 'filled'}
                                  color={attr.scope === 'local' ? 'info' : attr.scope === 'override' ? 'warning' : 'success'}
                                  onClick={() => {
                                    const scope = attr.scope || 'global'
                                    if (excludedScopes.includes(scope)) {
                                      setExcludedScopes(excludedScopes.filter(s => s !== scope))
                                    } else {
                                      setExcludedScopes([...excludedScopes, scope])
                                    }
                                  }}
                                  sx={{ height: 20, fontSize: '0.7rem', cursor: 'pointer' }}
                                />
                                <Chip
                                  label={attr.attributeType}
                                  size="small"
                                  variant={selectedTypes.includes(attr.attributeType) ? 'filled' : 'outlined'}
                                  color={selectedTypes.includes(attr.attributeType) ? 'primary' : 'default'}
                                  onClick={() => {
                                    if (selectedTypes.includes(attr.attributeType)) {
                                      setSelectedTypes(selectedTypes.filter(t => t !== attr.attributeType))
                                    } else {
                                      setSelectedTypes([...selectedTypes, attr.attributeType])
                                    }
                                  }}
                                  sx={{ height: 20, fontSize: '0.7rem', cursor: 'pointer' }}
                                />
                              </Box>
                              {attr.description && (
                                <TruncatedText variant="caption" color="text.secondary" maxLines={1} title={attr.name} showCopy={false}>
                                  {attr.description}
                                </TruncatedText>
                              )}
                              {attr.tags && attr.tags.length > 0 && (
                                <Box sx={{ mt: 0.5 }}>
                                  <TagsDisplay
                                    tags={attr.tags}
                                    maxVisible={2}
                                    label={`Tags for ${attr.name}`}
                                    selectedTags={selectedTags}
                                    onTagClick={(tag) => {
                                      if (selectedTags.includes(tag)) {
                                        // Remove tag if already selected (toggle off)
                                        setSelectedTags(selectedTags.filter(t => t !== tag))
                                      } else {
                                        // Add tag if not selected (toggle on)
                                        setSelectedTags([...selectedTags, tag])
                                      }
                                    }}
                                  />
                                </Box>
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
                        const value = currentAsset.attributes?.[attr.apiKey]
                        const hasTags = attr.tags && attr.tags.length > 0
                        const hasDescription = !!attr.description
                        const padding = 24

                        // Calculate left column height (name + type/scope chips + description + tags)
                        let leftHeight = 28 // name line
                        leftHeight += 28 // type/scope chips row
                        if (hasDescription) {
                          leftHeight += 36 // single line description + "see full text" link
                        }
                        if (hasTags && attr.tags) {
                          leftHeight += 26 // single row of tags
                        }

                        // Calculate right column height based on value type
                        // Add extra height for TruncatedText "see full text" link when content is long
                        let rightHeight = 28
                        if (value !== null && value !== undefined) {
                          if (attr.attributeType === 'json' || typeof value === 'object') {
                            const formatted = JSON.stringify(value, null, 2)
                            const lines = Math.min(3, formatted.split('\n').length)
                            rightHeight = (lines * 24) + 32
                          } else if (attr.attributeType === 'boolean') {
                            rightHeight = 32
                          } else {
                            const strValue = String(value)
                            const estimatedLines = Math.min(3, Math.ceil(strValue.length / 50))
                            rightHeight = estimatedLines * 24
                            // Add space for "see full text" if content is likely truncated
                            if (strValue.length > 100) {
                              rightHeight += 20
                            }
                          }
                        }

                        return padding + Math.max(leftHeight, rightHeight)
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
                      id: currentAsset.id,
                      name: currentAsset.name,
                      assetType: currentAsset.assetType,
                      assetTypeName: currentAsset.assetTypeName || '',
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

            {/* Third Row: Audit History */}
            <Grid size={{ xs: 12 }}>
              <AssetAuditLogSection assetId={asset.id} />
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
                    {currentAsset.id}
                  </CopyableText>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 500, color: 'text.secondary', border: 0, pl: 0 }}>Asset Type ID</TableCell>
                <TableCell sx={{ border: 0, pr: 0 }}>
                  <CopyableText variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {currentAsset.assetType}
                  </CopyableText>
                </TableCell>
              </TableRow>
              {currentAsset.h3Index && (
                <TableRow>
                  <TableCell sx={{ fontWeight: 500, color: 'text.secondary', border: 0, pl: 0 }}>H3 Index</TableCell>
                  <TableCell sx={{ border: 0, pr: 0 }}>
                    <CopyableText variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {currentAsset.h3Index}
                    </CopyableText>
                  </TableCell>
                </TableRow>
              )}
              {currentAsset.parent && (
                <TableRow>
                  <TableCell sx={{ fontWeight: 500, color: 'text.secondary', border: 0, pl: 0 }}>Parent ID</TableCell>
                  <TableCell sx={{ border: 0, pr: 0 }}>
                    <CopyableText variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {currentAsset.parent}
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
                    {currentAsset.apiUrl || `${window.location.origin}/api/assets/${currentAsset.id}/`}
                  </CopyableText>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      </Drawer>

      <AssetEditDialog
        open={editDialogOpen}
        asset={currentAsset}
        attributes={attributes}
        workspaceId={workspaceId || ''}
        assetTypeId={assetTypeId || ''}
        onClose={handleEditDialogClose}
        onSuccess={handleEditSuccess}
      />
    </Box>
  )
}
