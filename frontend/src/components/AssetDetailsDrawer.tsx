import { useEffect, useState, useRef } from 'react'
import { Box, Typography, IconButton, CircularProgress, Paper } from '@mui/material'
import { Close as CloseIcon, DragHandle as DragHandleIcon } from '@mui/icons-material'
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
  const resizeRef = useRef<HTMLDivElement>(null)

  // Open drawer when asset changes from null/undefined to a value
  useEffect(() => {
    if (asset) {
      setIsOpen(true)
    }
  }, [asset?.id])

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
    e.preventDefault()
    setIsResizing(true)
  }

  // Resize functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      const clampedWidth = Math.max(300, Math.min(window.innerWidth - 200, newWidth))
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
    // Delay the actual close to allow animation to complete
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
    <Paper
      sx={{
        position: 'fixed',
        top: 64, // Below app bar
        right: 0,
        bottom: 0,
        width: `${panelWidth}px`,
        zIndex: 1000,
        borderLeft: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'row',
        boxShadow: 3,
        transform: isOpen ? 'translateX(0)' : `translateX(${panelWidth + 10}px)`,
        transition: 'transform 0.3s ease-in-out'
      }}
    >
      {/* Resize Handle */}
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
                onShare={() => console.debug('Share asset:', asset.id)}
                onViewDetails={() => console.debug('View details page:', asset.id)}
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
  )
}
