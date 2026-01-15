import { useEffect, useState, useRef } from 'react'
import { Box, CircularProgress, Paper, Slide } from '@mui/material'
import { DragHandle as DragHandleIcon } from '@mui/icons-material'
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
  asset: Asset | null | undefined
  organizationId: string
  workspaceId: string
  onClose: () => void
  onEdit?: (asset: Asset) => void
  onDelete?: (asset: Asset) => void
  attributes?: AssetTypeAttribute[]
}

export default function AssetDetailsDrawer({ asset, organizationId, workspaceId, onClose, onEdit, onDelete, attributes: propAttributes }: AssetDetailsDrawerProps) {
  const { activeOrganization } = useOrganization()
  const [fullAsset, setFullAsset] = useState<Asset | null>(null)
  const [attributes, setAttributes] = useState<AssetTypeAttribute[]>(propAttributes || [])
  const [loading, setLoading] = useState(false)
  const [relatedAssets, setRelatedAssets] = useState<RelatedAssetsResponse | null>(null)
  const [relatedLoading, setRelatedLoading] = useState(true)
  const [relatedError, setRelatedError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [excludedScopes, setExcludedScopes] = useState<string[]>([])
  const [globalValuesOnly, setGlobalValuesOnly] = useState(false)
  const [loadingGlobalValues, setLoadingGlobalValues] = useState(false)
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('assetDetailsPanelWidth')
    return saved ? parseInt(saved, 10) : 600
  }) // Default width in pixels
  const [isResizing, setIsResizing] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isDraggable, setIsDraggable] = useState(true)
  const resizeRef = useRef<HTMLDivElement>(null)

  // Open drawer when asset changes from null/undefined to a value
  useEffect(() => {
    if (asset) {
      setIsOpen(true)
    }
  }, [asset?.id])

  // Check screen size and update draggable state
  useEffect(() => {
    const checkScreenSize = () => {
      const minScreenWidth = 700 // Minimum screen width to allow dragging (350 for drawer + 350 for content)
      setIsDraggable(window.innerWidth >= minScreenWidth)
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)

    return () => {
      window.removeEventListener('resize', checkScreenSize)
    }
  }, [])

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




  const handleResizeStart = (e: React.MouseEvent) => {
    if (!isDraggable) return
    e.preventDefault()
    setIsResizing(true)
  }

  // Resize functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      const clampedWidth = Math.max(350, Math.min(window.innerWidth - 200, newWidth))
      setPanelWidth(clampedWidth)
      localStorage.setItem('assetDetailsPanelWidth', clampedWidth.toString())
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])


  const handleClose = () => {
    setIsOpen(false)
    // Delay calling onClose to allow slide-out animation to complete
    setTimeout(() => {
      onClose()
    }, 300)
  }

  // Don't render anything if there's no asset
  if (!asset) {
    return null
  }

  const displayAsset = fullAsset || asset

  return (
    <Slide
      direction={isDraggable ? "left" : "up"}
      in={isOpen}
      timeout={300}
      container={isDraggable ? undefined : document.body}
      style={!isDraggable ? {
        position: 'absolute',
        top: 56,
        bottom: 56,
        left: 0,
        right: 0
      } : undefined}
    >
      <Paper
        sx={{
          position: 'fixed',
          top: isDraggable ? 64 : 56, // Higher up on mobile (56px instead of 64px)
          left: isDraggable ? 'auto' : 0,
          right: 0,
          bottom: isDraggable ? 0 : 56, // Leave 56px for bottom nav on mobile
          width: isDraggable ? `${panelWidth}px` : '100%',
          height: isDraggable ? 'auto' : 'calc(100vh - 112px)', // 56px top + 56px bottom
          zIndex: 1000,
          borderLeft: isDraggable ? 1 : 0,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'row',
          boxShadow: 3
        }}
      >
        {/* Resize Handle */}
        {isDraggable && (
          <Box
            ref={resizeRef}
            onMouseDown={handleResizeStart}
            sx={{
              width: '8px',
              cursor: 'ew-resize',
              backgroundColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              '&:hover': {
                backgroundColor: 'action.hover'
              }
            }}
          >
            <DragHandleIcon sx={{ fontSize: 16, color: 'text.secondary', transform: 'rotate(90deg)' }} />
          </Box>
        )}

        {/* Main Content */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Pinned Overview Card */}
              <Box sx={{ flexShrink: 0 }}>
                <AssetOverviewCard
                  asset={displayAsset}
                  mode="drawer"
                  globalValuesOnly={globalValuesOnly}
                  onGlobalValuesToggle={() => setGlobalValuesOnly(!globalValuesOnly)}
                  onEdit={onEdit}
                  onShare={() => navigator.clipboard.writeText(window.location.href)}
                  onViewDetails={() => window.open(`/organizations/${organizationId}/workspaces/${workspaceId}/asset-types/${displayAsset.assetType}/assets/${displayAsset.id}`, '_blank')}
                  onClone={() => console.debug('Clone asset:', asset.id)}
                  onDownload={() => console.debug('Download asset:', asset.id)}
                  onSystemDetails={() => console.debug('System details:', asset.id)}
                  onClose={handleClose}
                />
              </Box>

              {/* Scrollable Cards Section */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Attributes Card */}
                <Box sx={{ minHeight: 400, display: 'flex', flexDirection: 'column' }}>
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
                </Box>

                {/* Asset Tree Card */}
                <Box sx={{ minHeight: 400, display: 'flex', flexDirection: 'column' }}>
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
                </Box>

                {/* Tasks Card */}
                <Box sx={{ minHeight: 400, display: 'flex', flexDirection: 'column' }}>
                  <TasksCard asset={displayAsset} />
                </Box>

                {/* Files Card */}
                <Box sx={{ minHeight: 400, display: 'flex', flexDirection: 'column' }}>
                  <FilesCard asset={displayAsset} />
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Paper>
    </Slide>
  )
}
