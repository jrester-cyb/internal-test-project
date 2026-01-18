import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
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
import { fetchRelatedAssets, fetchAssetAttributeDefinitions, type RelatedAssetsResponse, type RelatedAsset } from '@app/api/assets'
import type { AssetDetailLoaderData } from '@app/loaders/assetTypes'

const ATTRIBUTES_PAGE_SIZE = 20

export default function AssetDetailPage() {
  const loaderData = useLoaderData() as AssetDetailLoaderData
  const { asset, initialAttributes, totalAttributeCount, assetTypeId: loaderAssetTypeId } = loaderData
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

  // Card open/collapsed states
  const [attributesOpen, setAttributesOpen] = useState(true)
  const [treeOpen, setTreeOpen] = useState(true)
  const [tasksOpen, setTasksOpen] = useState(true)
  const [filesOpen, setFilesOpen] = useState(true)

  // Stable toggle callbacks
  const toggleAttributes = useCallback(() => setAttributesOpen(prev => !prev), [])
  const toggleTree = useCallback(() => setTreeOpen(prev => !prev), [])
  const toggleTasks = useCallback(() => setTasksOpen(prev => !prev), [])
  const toggleFiles = useCallback(() => setFilesOpen(prev => !prev), [])

  // Attributes state for infinite scrolling
  const [attributesMap, setAttributesMap] = useState<Map<number, AssetTypeAttribute>>(() => {
    const map = new Map<number, AssetTypeAttribute>()
    initialAttributes.forEach((attr, index) => map.set(index, attr))
    return map
  })
  const [attributesLoading, setAttributesLoading] = useState(false)

  // Reset attributes when loader data changes (e.g., navigating to different asset)
  useEffect(() => {
    const map = new Map<number, AssetTypeAttribute>()
    initialAttributes.forEach((attr, index) => map.set(index, attr))
    setAttributesMap(map)
  }, [initialAttributes])

  // Load more attributes when scrolling
  const handleLoadAttributeRange = useCallback(async (startIndex: number, endIndex: number) => {
    if (!organizationId || !assetTypeId || attributesLoading) return

    // Calculate page number based on range
    const page = Math.floor(startIndex / ATTRIBUTES_PAGE_SIZE) + 1

    setAttributesLoading(true)
    try {
      const response = await fetchAssetAttributeDefinitions(
        organizationId,
        workspaceId,
        assetTypeId,
        page,
        ATTRIBUTES_PAGE_SIZE
      )

      // Calculate the starting index for this page
      const pageStartIndex = (page - 1) * ATTRIBUTES_PAGE_SIZE

      setAttributesMap(prev => {
        const newMap = new Map(prev)
        response.results?.forEach((attr: AssetTypeAttribute, i: number) => {
          newMap.set(pageStartIndex + i, attr)
        })
        return newMap
      })
    } catch (err) {
      console.error('Failed to load more attributes:', err)
    } finally {
      setAttributesLoading(false)
    }
  }, [organizationId, workspaceId, assetTypeId, attributesLoading])

  // Get all loaded attributes as an array for the edit dialog
  const allLoadedAttributes = useMemo(() => {
    return Array.from(attributesMap.values())
  }, [attributesMap])

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

  // Build the map URL based on context (workspace or organization level)
  const viewOnMapUrl = useMemo(() => {
    const basePath = workspaceId
      ? `/organizations/${organizationId}/workspaces/${workspaceId}`
      : `/organizations/${organizationId}`

    const coords = asset.location?.coordinates || asset.geometry?.coordinates
    const params = new URLSearchParams()
    params.set('assetId', asset.id)

    if (coords && coords.length >= 2) {
      params.set('lat', coords[1].toString())
      params.set('lng', coords[0].toString())
      params.set('zoom', '18')
    }

    return `${basePath}/map?${params.toString()}`
  }, [organizationId, workspaceId, asset.id, asset.location, asset.geometry])

  // Build the share URL (current page URL)
  const shareUrl = useMemo(() => {
    const basePath = workspaceId
      ? `/organizations/${organizationId}/workspaces/${workspaceId}`
      : `/organizations/${organizationId}`
    return `${window.location.origin}${basePath}/asset-types/${assetTypeId}/assets/${asset.id}`
  }, [organizationId, workspaceId, assetTypeId, asset.id])

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
        shareUrl={shareUrl}
        viewOnMapUrl={viewOnMapUrl}
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
                attributesMap={attributesMap}
                totalAttributeCount={totalAttributeCount}
                onLoadRange={handleLoadAttributeRange}
                showHidden={showHidden}
                onShowHiddenChange={setShowHidden}
                selectedTags={selectedTags}
                onSelectedTagsChange={setSelectedTags}
                selectedTypes={selectedTypes}
                onSelectedTypesChange={setSelectedTypes}
                excludedScopes={excludedScopes}
                onExcludedScopesChange={setExcludedScopes}
                isLoading={loadingGlobalValues || attributesLoading}
                open={attributesOpen}
                onToggle={toggleAttributes}
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
                  assetTypeName: currentAsset.assetTypeName || 'Unknown',
                  hasChildren: relatedAssets?.children.length > 0 || false,
                  relatedUrl: '' // Not needed for root
                }}
                open={treeOpen}
                onToggle={toggleTree}
              />
            </Grid>

            {/* Second Row: Tasks, Files */}
            <Grid size={{ xs: 12, md: 6 }}>
              <TasksCard open={tasksOpen} onToggle={toggleTasks} />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FilesCard open={filesOpen} onToggle={toggleFiles} />
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
        attributes={allLoadedAttributes}
        organizationId={organizationId || ''}
        workspaceId={workspaceId || ''}
        assetTypeId={assetTypeId || ''}
        onSuccess={handleEditSuccess}
      />
    </Box>
  )
}