import { useState, useRef, useEffect, useMemo } from 'react'
import { useLoaderData, useParams } from 'react-router-dom'
import { Box, Container, Grid, Typography } from '@mui/material'
import type { Asset, AssetTypeAttribute } from '@app/types'
import AssetOverviewCard from '@app/components/AssetOverviewCard'
import AttributesCard from '@app/components/AttributesCard'
import AssetTreeCard from '@app/components/AssetTreeCard'
import TasksCard from '@app/components/TasksCard'
import FilesCard from '@app/components/FilesCard'
import { AssetAuditLogSection } from '@app/components/AssetAuditLogSection'
import AssetEditDialog from '@app/components/AssetEditDialog'
import { fetchRelatedAssets, type RelatedAssetsResponse, type RelatedAsset } from '@app/api/assets'

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

  const headerRef = useRef<HTMLDivElement>(null)
  const [relatedAssets, setRelatedAssets] = useState<RelatedAssetsResponse | null>(null)
  const [relatedLoading, setRelatedLoading] = useState(true)
  const [relatedError, setRelatedError] = useState<string | null>(null)
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
    if (!organizationId || !workspaceId || !asset.id) return

    setLoadingGlobalValues(true)
    import('../api/assets').then(({ getAsset }) => {
      const url = globalValuesOnly ? `${asset.id}/?global_values_only=true` : asset.id
      getAsset(organizationId, workspaceId, url)
        .then(setCurrentAsset)
        .catch(err => console.error('Failed to fetch asset:', err))
        .finally(() => setLoadingGlobalValues(false))
    })
  }, [organizationId, workspaceId, asset.id, globalValuesOnly])

  // Fetch related assets
  useEffect(() => {
    if (organizationId && asset.id) {
      setRelatedLoading(true)
      setRelatedError(null)
      fetchRelatedAssets(organizationId, workspaceId, asset.id)
        .then(setRelatedAssets)
        .catch((err) => {
          console.error('Failed to fetch related assets:', err)
          setRelatedError(err.message || 'Failed to load related assets')
        })
        .finally(() => setRelatedLoading(false))
    }
  }, [organizationId, workspaceId, asset.id])


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
    // Open map page in new window with the asset selected
    const coords = asset.location?.coordinates || asset.geometry?.coordinates
    if (coords && coords.length >= 2) {
      const lat = coords[1]
      const lng = coords[0]
      window.open(`/organizations/${organizationId}/workspaces/${workspaceId}/map?lat=${lat}&lng=${lng}&zoom=18&assetId=${asset.id}`, '_blank')
    } else {
      // No coordinates, just open map with asset selected
      window.open(`/organizations/${organizationId}/workspaces/${workspaceId}/map?assetId=${asset.id}`, '_blank')
    }
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
        mode="page"
        globalValuesOnly={globalValuesOnly}
        onGlobalValuesToggle={() => setGlobalValuesOnly(!globalValuesOnly)}
        onEdit={handleEdit}
        onShare={handleShare}
        onViewOnMap={handleViewOnMap}
        onClone={() => {
          // TODO: Implement clone functionality
          console.debug('Clone asset:', asset.id)
        }}
        onDownload={handleDownload}
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

            <Grid size={{ xs: 12, md: 6 }} sx={{ minHeight: 400, display: 'flex' }}>
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
                  assetTypeName: 'Unknown',
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

      <AssetEditDialog
        open={editDialogOpen}
        onClose={handleEditDialogClose}
        asset={currentAsset}
        attributes={attributes}
        organizationId={organizationId || ''}
        workspaceId={workspaceId || ''}
        assetTypeId={assetTypeId || ''}
        onSuccess={handleEditSuccess}
      />
    </Box>
  )
}