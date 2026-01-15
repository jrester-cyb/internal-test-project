import { useEffect, useState, useRef } from 'react'
import { Box, Typography, IconButton, CircularProgress, Drawer, Container, Grid } from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'
import type { Asset, AssetTypeAttribute } from '../types'
import { getAsset, fetchAssetAttributeDefinitions, fetchRelatedAssets } from '../api/assets'
import AssetOverviewCard from './AssetOverviewCard'
import AttributesCard from './AttributesCard'
import AssetTreeCard from './AssetTreeCard'
import TasksCard from './TasksCard'
import FilesCard from './FilesCard'
import { useOrganization } from '../contexts/OrganizationContext'
import type { RelatedAssetsResponse } from '../api/assets'

interface AssetDetailsDrawerProps {
  asset: Asset
  workspaceId: string
  onClose: () => void
  onEdit?: (asset: Asset) => void
  onDelete?: (asset: Asset) => void
  attributes?: AssetTypeAttribute[]
}

export default function AssetDetailsDrawer({ asset, workspaceId, onClose, onEdit, onDelete, attributes: propAttributes }: AssetDetailsDrawerProps) {
  const { activeOrganization } = useOrganization()
  const [fullAsset, setFullAsset] = useState<Asset | null>(null)
  const [attributes, setAttributes] = useState<AssetTypeAttribute[]>(propAttributes || [])
  const [loading, setLoading] = useState(false)
  const [relatedAssets, setRelatedAssets] = useState<RelatedAssetsResponse | null>(null)
  const [relatedLoading, setRelatedLoading] = useState(true)
  const [relatedError, setRelatedError] = useState<string | null>(null)
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const headerRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const leftContentRef = useRef<HTMLDivElement>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [excludedScopes, setExcludedScopes] = useState<string[]>([])
  const [globalValuesOnly, setGlobalValuesOnly] = useState(false)
  const [loadingGlobalValues, setLoadingGlobalValues] = useState(false)

  useEffect(() => {
    async function loadFullAsset() {
      if (!workspaceId || !asset?.id) return
      setLoading(true)
      try {
        const data = await getAsset(workspaceId, asset.id)
        setFullAsset(data)

        // Fetch attributes if not provided and we have an asset type
        if (!propAttributes && data.assetType) {
          const attrsResponse = await fetchAssetAttributeDefinitions(workspaceId, data.assetType)
          setAttributes(attrsResponse.results || [])
        }
      } catch (error) {
        console.error('Error loading asset details:', error)
      } finally {
        setLoading(false)
      }
    }
    loadFullAsset()
  }, [asset?.id, workspaceId, propAttributes])

  // Fetch related assets
  useEffect(() => {
    if (workspaceId && asset?.id) {
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
  }, [workspaceId, asset?.id])

  // Track container width for responsive buttons
  useEffect(() => {
    const updateWidth = () => {
      if (headerRef.current && leftContentRef.current) {
        const containerWidth = headerRef.current.offsetWidth
        const leftContentWidth = leftContentRef.current.offsetWidth
        // Available space for buttons is container width minus left content width, minus some padding
        const availableSpace = Math.max(0, containerWidth - leftContentWidth - 100) // 100px buffer
        setContainerWidth(availableSpace)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Refetch asset when globalValuesOnly toggle changes
  useEffect(() => {
    if (!workspaceId || !asset?.id) return

    setLoadingGlobalValues(true)
    getAsset(workspaceId, globalValuesOnly ? `${asset.id}/?global_values_only=true` : asset.id)
      .then(setFullAsset)
      .catch(err => console.error('Failed to fetch asset:', err))
      .finally(() => setLoadingGlobalValues(false))
  }, [workspaceId, asset?.id, globalValuesOnly])

  const displayAsset = fullAsset || asset

  // Ensure we have an asset before rendering
  if (!displayAsset) {
    return (
      <Drawer
        anchor="right"
        open={true}
        onClose={onClose}
        PaperProps={{ sx: { width: '80vw', maxWidth: 1200 } }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="h6" component="h2">Asset Details</Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Typography>Loading asset...</Typography>
          </Box>
        </Box>
      </Drawer>
    )
  }

  // Get all unique tags from attributes
  const availableTags = (Array.isArray(attributes) ? attributes : []).reduce((tags: string[], attr) => {
    if (attr.tags) {
      attr.tags.forEach(tag => {
        if (!tags.includes(tag)) tags.push(tag)
      })
    }
    return tags
  }, []).sort()

  const actions = [
    {
      label: 'Share',
      icon: <span>Share</span>,
      onClick: () => console.debug('Share asset:', asset.id),
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: 1200
    },
    {
      label: 'View on Map',
      icon: <span>Map</span>,
      onClick: () => console.debug('View on map:', asset.id),
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: 900
    },
    {
      label: 'Edit',
      icon: <span>Edit</span>,
      onClick: () => onEdit?.(displayAsset),
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: 600
    },
    {
      label: 'System Details',
      icon: <span>Info</span>,
      onClick: () => console.debug('System details:', asset.id),
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: Infinity
    },
    {
      label: 'Clone',
      icon: <span>Clone</span>,
      onClick: () => console.debug('Clone asset:', asset.id),
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: Infinity
    },
    {
      label: 'Download',
      icon: <span>Download</span>,
      onClick: () => console.debug('Download asset:', asset.id),
      color: 'inherit' as const,
      variant: 'outlined' as const,
      minWidth: Infinity
    }
  ]

  return (
    <Drawer
      anchor="right"
      open={true}
      onClose={onClose}
      PaperProps={{ sx: { width: '80vw', maxWidth: 1200 } }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header with close button */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6" component="h2">Asset Details</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Scrollable Content */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Fixed Header */}
              <AssetOverviewCard
                asset={displayAsset}
                globalValuesOnly={globalValuesOnly}
                onGlobalValuesToggle={() => setGlobalValuesOnly(!globalValuesOnly)}
                actions={actions}
                containerWidth={containerWidth}
                menuAnchorEl={menuAnchorEl}
                setMenuAnchorEl={setMenuAnchorEl}
                containerRef={headerRef}
                actionsRef={actionsRef}
                leftContentRef={leftContentRef}
              />

              {/* Scrollable Content */}
              <Container maxWidth={false} sx={{ py: 3 }}>
                <Grid container spacing={3}>
                  {/* First Row: Attributes, Asset Tree */}
                  <Grid item xs={12} md={6}>
                    <AttributesCard
                      asset={displayAsset}
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
                  <Grid item xs={12} md={6}>
                    <AssetTreeCard
                      assetId={displayAsset.id}
                      relatedAssets={relatedAssets}
                      loading={relatedLoading}
                      error={relatedError}
                      organizationId={activeOrganization?.id || ''}
                      workspaceId={workspaceId}
                      currentAsset={{
                        id: displayAsset.id,
                        name: displayAsset.name,
                        assetType: displayAsset.assetType,
                        assetTypeName: displayAsset.assetType?.name || 'Unknown'
                      }}
                    />
                  </Grid>

                  {/* Second Row: Tasks, Files */}
                  <Grid item xs={12} md={6}>
                    <TasksCard asset={displayAsset} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FilesCard asset={displayAsset} />
                  </Grid>
                </Grid>
              </Container>
            </>
          )}
        </Box>
      </Box>
    </Drawer>
  )
}
