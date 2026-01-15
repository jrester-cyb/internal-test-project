import { useState, useRef, useEffect, useMemo } from 'react'
import { useLoaderData, useParams } from 'react-router-dom'
import { Box, Container, Grid, Drawer, Divider, Typography, IconButton } from '@mui/material'
import { Info as InfoIcon, Close as CloseIcon, Edit as EditIcon, Map as MapIcon, Share as ShareIcon, Download as DownloadIcon, FileCopy as CloneIcon } from '@mui/icons-material'
import type { Asset, AssetTypeAttribute } from '../types'
import AssetOverviewCard from '../components/AssetOverviewCard'
import AttributesCard from '../components/AttributesCard'
import AssetTreeCard from '../components/AssetTreeCard'
import TasksCard from '../components/TasksCard'
import FilesCard from '../components/FilesCard'
import { AssetAuditLogSection } from '../components/AssetAuditLogSection'
import AssetEditDialog from '../components/AssetEditDialog'
import { fetchRelatedAssets, type RelatedAssetsResponse, type RelatedAsset } from '../api/assets'

export default function AssetDetailPage() {
  const { asset, attributes } = useLoaderData() as { asset: Asset, attributes: AssetTypeAttribute[] }
  const { organizationId, workspaceId, assetTypeId } = useParams<{ organizationId: string; workspaceId: string; assetTypeId: string }>()

  // Early return if asset is not loaded yet
  if (!asset) {
    return (
      <Box sx={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Typography>Loading asset...</Typography>
      </Box>
    )
  }

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
  const [globalValuesOnly, setGlobalValuesOnly] = useState(false)
  const [loadingGlobalValues, setLoadingGlobalValues] = useState(false)

  // Get all unique tags from attributes
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    attributes.forEach(attr => {
      attr.tags?.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [attributes])

  // Refetch asset when globalValuesOnly toggle changes
  useEffect(() => {
    if (!workspaceId || !asset.id) return

    setLoadingGlobalValues(true)
    import('../api/assets').then(({ getAsset }) => {
      const url = globalValuesOnly ? `${asset.id}/?global_values_only=true` : asset.id
      getAsset(workspaceId, url)
        .then(setCurrentAsset)
        .catch(err => console.error('Failed to fetch asset:', err))
        .finally(() => setLoadingGlobalValues(false))
    })
  }, [workspaceId, asset.id, globalValuesOnly])

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

  // Ensure we have currentAsset before rendering
  if (!currentAsset) {
    return (
      <Box sx={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Typography>Loading asset details...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Fixed Header */}
      <AssetOverviewCard
        asset={currentAsset}
        globalValuesOnly={globalValuesOnly}
        onGlobalValuesToggle={() => setGlobalValuesOnly(!globalValuesOnly)}
        actions={actions}
        containerWidth={containerWidth}
        menuAnchorEl={menuAnchorEl}
        setMenuAnchorEl={setMenuAnchorEl}
      />

      {/* Scrollable Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Container maxWidth={false} sx={{ py: 3 }}>
          <Grid container spacing={3}>
            {/* First Row: Attributes, Asset Tree */}
            <Grid size={{ xs: 12, md: 6 }}>
              <AttributesCard
                asset={currentAsset}
                attributes={attributes}
                showHidden={showHidden}
                onShowHiddenChange={setShowHidden}
                selectedTags={selectedTags}
                onSelectedTagsChange={setSelectedTags}
                selectedTypes={selectedTypes}
                onSelectedTypesChange={setSelectedTypes}
                excludedScopes={excludedScopes}
                onExcludedScopesChange={setExcludedScopes}
                isLoading={loadingGlobalValues}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AssetTreeCard
                assetId={asset.id}
                relatedAssets={relatedAssets}
                loading={relatedLoading}
                error={relatedError}
                organizationId={organizationId || ''}
                workspaceId={workspaceId || ''}
                currentAsset={{
                  id: currentAsset.id,
                  name: currentAsset.name,
                  assetType: currentAsset.assetType,
                  assetTypeName: currentAsset.assetType?.name || 'Unknown',
                  hasChildren: relatedAssets?.children.length > 0 || false,
                  relatedUrl: '' // Not needed for root
                }}
              />
            </Grid>

            {/* Second Row: Tasks, Files */}
            <Grid size={{ xs: 12, md: 6 }}>
              <TasksCard />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FilesCard />
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

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Asset ID</Typography>
          <Typography variant="body2" sx={{ mb: 2, fontFamily: 'monospace' }}>{asset.id}</Typography>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Asset Type ID</Typography>
          <Typography variant="body2" sx={{ mb: 2, fontFamily: 'monospace' }}>{asset.assetType}</Typography>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Created</Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>{new Date(asset.createdAt).toLocaleString()}</Typography>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Updated</Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>{new Date(asset.updatedAt).toLocaleString()}</Typography>

          {asset.location && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Location</Typography>
              <Typography variant="body2" sx={{ mb: 2, fontFamily: 'monospace' }}>
                {asset.location.type}: [{asset.location.coordinates.join(', ')}]
              </Typography>
            </>
          )}
        </Box>
      </Drawer>

      <AssetEditDialog
        open={editDialogOpen}
        onClose={handleEditDialogClose}
        asset={currentAsset}
        attributes={attributes}
        onSuccess={handleEditSuccess}
      />
    </Box>
  )
}