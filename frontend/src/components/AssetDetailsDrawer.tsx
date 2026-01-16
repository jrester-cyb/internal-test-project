import { useEffect, useState } from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'
import type { Asset, AssetTypeAttribute } from '../types'
import { getAsset, fetchAssetAttributeDefinitions, fetchRelatedAssets } from '../api/assets'
import AssetOverviewCard from './AssetOverviewCard'
import AttributesCard from './AttributesCard'
import AssetTreeCard from './AssetTreeCard'
import TasksCard from './TasksCard'
import FilesCard from './FilesCard'
import MapDrawer from './MapDrawer'
import { useOrganization } from '../contexts/OrganizationContext'
import { DragHandle as DragHandleIcon } from '@mui/icons-material'
import type { RelatedAssetsResponse } from '../api/assets'
import {
  useSensors,
  useSensor,
  PointerSensor,
  KeyboardSensor,
  DndContext,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DragEndEvent } from '@dnd-kit/core'

interface AssetDetailsDrawerProps {
  asset: Asset | null | undefined
  organizationId: string
  workspaceId: string
  isOpen: boolean
  onClose: () => void
  onEdit?: (asset: Asset) => void
  onDelete?: (asset: Asset) => void
  attributes?: AssetTypeAttribute[]
}

export default function AssetDetailsDrawer({ asset, organizationId, workspaceId, isOpen, onClose, onEdit, onDelete, attributes: propAttributes }: AssetDetailsDrawerProps) {
  const { activeOrganization } = useOrganization()
  const [fullAsset, setFullAsset] = useState<Asset | null>(null)
  const [attributes, setAttributes] = useState<AssetTypeAttribute[]>(Array.isArray(propAttributes) ? propAttributes : [])
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
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
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
          setAttributes(Array.isArray(attrsResponse.results) ? attrsResponse.results : [])
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

  const displayAsset = fullAsset || asset

  return (
    <MapDrawer isOpen={isOpen} onClose={onClose}>
      {!displayAsset ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <CircularProgress />
        </Box>
      ) : (
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
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
                  </SortableContext>                </DndContext>
              </Box>
            </>
          )}
        </Box>
      )}
    </MapDrawer>
  )
}
