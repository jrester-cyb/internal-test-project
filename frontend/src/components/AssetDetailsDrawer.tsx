import { useEffect, useState, useRef } from 'react'
import { Box, CircularProgress, Paper, Slide, Typography, IconButton } from '@mui/material'
import { DragHandle as DragHandleIcon, Close as CloseIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material'
import type { Asset, AssetTypeAttribute } from '../types'
import { getAsset, fetchAssetAttributeDefinitions, fetchRelatedAssets } from '../api/assets'
import AssetOverviewCard from './AssetOverviewCard'
import AttributesCard from './AttributesCard'
import AssetTreeCard from './AssetTreeCard'
import TasksCard from './TasksCard'
import FilesCard from './FilesCard'
import { useOrganization } from '../contexts/OrganizationContext'
import type { RelatedAssetsResponse } from '../api/assets'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

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
    return saved ? parseInt(saved, 10) : 380
  }) // Default width in pixels
  const [isResizing, setIsResizing] = useState(false)
  const [isOpen, setIsOpen] = useState(!!asset)
  const [isDraggable, setIsDraggable] = useState(true)
  const [preventClick, setPreventClick] = useState(false)
  const [isSliding, setIsSliding] = useState(false)
  const [slideOffset, setSlideOffset] = useState(0)
  const resizeRef = useRef<HTMLDivElement>(null)

  // Card order for drag and drop (only in drawer mode)
  const [cardOrder, setCardOrder] = useState(() => {
    const saved = localStorage.getItem('assetDetailsCardOrder')
    return saved ? JSON.parse(saved) : ['attributes', 'tree', 'tasks', 'files']
  })

  // Save card order to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('assetDetailsCardOrder', JSON.stringify(cardOrder))
  }, [cardOrder])

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handle drag end
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setCardOrder((items) => {
        const oldIndex = items.indexOf(active.id as string)
        const newIndex = items.indexOf(over.id as string)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  // Sortable card wrapper component
  function SortableCard({ id, children }: { id: string; children: (dragHandleProps: { attributes: any; listeners: any }) => React.ReactNode }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    return (
      <Box
        ref={setNodeRef}
        style={style}
        sx={{
          position: 'relative',
        }}
      >
        {children({ attributes, listeners })}
      </Box>
    )
  }

  // Open/close drawer when asset changes
  useEffect(() => {
    setIsOpen(!!asset)
    setIsSliding(false)
    setSlideOffset(0)
  }, [asset])

  // Check screen size and update draggable state
  useEffect(() => {
    const checkScreenSize = () => {
      const minScreenWidth = 760 // Minimum screen width to allow dragging (380 for drawer + 380 for content)
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

      // If attributes are provided, assume the asset is already fully loaded
      if (propAttributes) {
        setFullAsset(asset)
        setAttributes(propAttributes)
        setLoading(false)
        return
      }

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

  const handleResizeClick = () => {
    // Don't close if this click was part of a double-click
    if (preventClick) {
      setPreventClick(false)
      return
    }
    handleClose()
  }

  const handleResizeDoubleClick = () => {
    setPreventClick(true) // Prevent the upcoming click event

    if (!isDraggable) return

    const minWidth = 380
    const maxWidth = window.innerWidth - 200
    const thirdWidth = Math.max(minWidth, Math.floor(window.innerWidth / 3))

    // Define the three sizes: min, third, max
    const sizes = [minWidth, thirdWidth, maxWidth]

    // Find the current size or closest match
    const currentSize = panelWidth
    let currentIndex = 0

    // Find which size we're closest to
    for (let i = 0; i < sizes.length; i++) {
      if (Math.abs(currentSize - sizes[i]) < Math.abs(currentSize - sizes[currentIndex])) {
        currentIndex = i
      }
    }

    // Move to next size, wrapping around
    const nextIndex = (currentIndex + 1) % sizes.length
    const newWidth = sizes[nextIndex]

    setPanelWidth(newWidth)
    localStorage.setItem('assetDetailsPanelWidth', newWidth.toString())
  }

  // Resize functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      const minWidth = 380
      if (newWidth <= minWidth) {
        console.log('Past minimum width:', newWidth, 'minWidth:', minWidth)
        if (!isSliding) {
          setIsSliding(true)
        }
        setSlideOffset(minWidth - newWidth)
      } else {
        if (isSliding) {
          setIsSliding(false)
          setSlideOffset(0)
        }
        const clampedWidth = Math.max(minWidth, Math.min(window.innerWidth - 200, newWidth))
        setPanelWidth(clampedWidth)
        localStorage.setItem('assetDetailsPanelWidth', clampedWidth.toString())
      }
    }

    const handleMouseUp = () => {
      if (isSliding) {
        console.log('Triggering drawer slide out due to release in sliding mode')
        setIsOpen(false)
        setTimeout(() => {
          onClose()
        }, 300)
      }
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
    console.log('Triggering drawer slide out due to handleClose')
    setIsOpen(false)
    setIsSliding(false)
    setSlideOffset(0)
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
      appear={false}
      timeout={300}
      container={isDraggable ? undefined : document.body}
      style={isDraggable ? (isSliding ? { transform: `translateX(${slideOffset}px)`, transition: 'none' } : undefined) : {
        position: 'absolute',
        top: 56,
        bottom: 56,
        left: 0,
        right: 0
      }}
    >
      <Paper
        elevation={0}
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
          transition: isDraggable && !isResizing ? 'width 0.3s ease-in-out' : 'none'
        }}
      >
        {/* Resize Handle */}
        {isDraggable && (
          <Box
            ref={resizeRef}
            onMouseDown={handleResizeStart}
            onClick={handleResizeClick}
            sx={{
              width: '12px',
              cursor: 'pointer',
              backgroundColor: 'background.paper',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              '&:hover': {
                backgroundColor: 'action.hover',
                '& .resize-dots': {
                  opacity: 0
                },
                '& .close-arrow': {
                  opacity: 1
                }
              }
            }}
          >
            <Box
              className="resize-dots"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.25,
                opacity: 0.6,
                transition: 'opacity 0.2s ease'
              }}
            >
              <Box sx={{ width: '2px', height: '2px', bgcolor: 'text.secondary', borderRadius: '50%' }} />
              <Box sx={{ width: '2px', height: '2px', bgcolor: 'text.secondary', borderRadius: '50%' }} />
              <Box sx={{ width: '2px', height: '2px', bgcolor: 'text.secondary', borderRadius: '50%' }} />
            </Box>

            <ChevronRightIcon
              className="close-arrow"
              sx={{
                position: 'absolute',
                opacity: 0,
                transition: 'opacity 0.2s ease',
                fontSize: 16,
                color: 'text.secondary'
              }}
            />
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
                />
              </Box>

              {/* Scrollable Cards Section */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Drag Indicator */}
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  pb: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  mb: 1,
                  justifyContent: 'flex-start'
                }}>
                  <DragHandleIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Drag cards to reorder
                  </Typography>
                </Box>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext items={cardOrder} strategy={rectSortingStrategy}>
                    {cardOrder.map((cardId) => {
                      switch (cardId) {
                        case 'attributes':
                          return (
                            <SortableCard key={cardId} id={cardId}>
                              {(dragHandleProps) => (
                                <Box sx={{ minHeight: 400, display: 'flex', flexDirection: 'column', flex: 1 }}>
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
                                    dragHandleProps={dragHandleProps}
                                  />
                                </Box>
                              )}
                            </SortableCard>
                          )
                        case 'tree':
                          return (
                            <SortableCard key={cardId} id={cardId}>
                              {(dragHandleProps) => (
                                <Box sx={{ minHeight: 400, display: 'flex', flexDirection: 'column', flex: 1 }}>
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
                                      assetTypeName: displayAsset.assetTypeName || (typeof displayAsset.assetType === 'string' ? displayAsset.assetType : 'Unknown')
                                    }}
                                    dragHandleProps={dragHandleProps}
                                  />
                                </Box>
                              )}
                            </SortableCard>
                          )
                        case 'tasks':
                          return (
                            <SortableCard key={cardId} id={cardId}>
                              {(dragHandleProps) => (
                                <Box sx={{ minHeight: 400, display: 'flex', flexDirection: 'column', flex: 1 }}>
                                  <TasksCard dragHandleProps={dragHandleProps} />
                                </Box>
                              )}
                            </SortableCard>
                          )
                        case 'files':
                          return (
                            <SortableCard key={cardId} id={cardId}>
                              {(dragHandleProps) => (
                                <Box sx={{ minHeight: 400, display: 'flex', flexDirection: 'column', flex: 1 }}>
                                  <FilesCard dragHandleProps={dragHandleProps} />
                                </Box>
                              )}
                            </SortableCard>
                          )
                        default:
                          return null
                      }
                    })}
                  </SortableContext>
                </DndContext>
              </Box>
            </>
          )}
        </Box>
      </Paper>
    </Slide>
  )
}
