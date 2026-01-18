import { useEffect, useState, useMemo, useCallback } from 'react'
import { Box, Skeleton, Typography } from '@mui/material'
import { DragHandle as DragHandleIcon } from '@mui/icons-material'
import type { Asset, AssetTypeAttribute } from '@app/types'
import { getAsset, fetchAssetAttributeDefinitions, fetchRelatedAssets } from '@app/api/assets'
import AssetOverviewCard from '@app/components/AssetOverviewCard'
import AttributesCard from '@app/components/AttributesCard'
import AssetTreeCard from '@app/components/AssetTreeCard'
import TasksCard from '@app/components/TasksCard'
import FilesCard from '@app/components/FilesCard'
import { useOrganization } from '@app/contexts/OrganizationContext'
import type { RelatedAssetsResponse } from '@app/api/assets'

const ATTRIBUTES_PAGE_SIZE = 20
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

export interface AssetContentProps {
  organizationId: string
  workspaceId?: string
  asset: Asset
  attributes?: AssetTypeAttribute[]
  onEdit?: (asset: Asset) => void
  onDelete?: (asset: Asset) => void
  onZoomToAsset?: (asset: Asset) => void
}

export default function AssetContent({
  organizationId,
  workspaceId,
  asset,
  attributes: propAttributes,
  onEdit,
  onDelete,
  onZoomToAsset,
}: AssetContentProps) {
  const { activeOrganization } = useOrganization()
  const [fullAsset, setFullAsset] = useState<Asset | null>(null)
  const [attributesMap, setAttributesMap] = useState<Map<number, AssetTypeAttribute>>(() => {
    const map = new Map<number, AssetTypeAttribute>()
    if (Array.isArray(propAttributes)) {
      propAttributes.forEach((attr, index) => map.set(index, attr))
    }
    return map
  })
  const [totalAttributeCount, setTotalAttributeCount] = useState(Array.isArray(propAttributes) ? propAttributes.length : 0)
  const [loading, setLoading] = useState(false)
  const [attributesLoading, setAttributesLoading] = useState(false)
  const [relatedAssets, setRelatedAssets] = useState<RelatedAssetsResponse | null>(null)
  const [relatedLoading, setRelatedLoading] = useState(true)
  const [relatedError, setRelatedError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [excludedScopes, setExcludedScopes] = useState<string[]>([])
  const [globalValuesOnly, setGlobalValuesOnly] = useState(false)

  // Card order for drag and drop
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
      setCardOrder((items: string[]) => {
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
    // Reset state when asset changes - this ensures we show the new asset immediately
    setFullAsset(null)
    const newMap = new Map<number, AssetTypeAttribute>()
    if (Array.isArray(propAttributes)) {
      propAttributes.forEach((attr, index) => newMap.set(index, attr))
    }
    setAttributesMap(newMap)
    setTotalAttributeCount(Array.isArray(propAttributes) ? propAttributes.length : 0)
    setRelatedAssets(null)
    setRelatedError(null)

    async function loadFullAsset() {
      if (!organizationId || !asset?.id) return

      // If attributes are provided with actual data, assume the asset is already fully loaded
      if (propAttributes && propAttributes.length > 0) {
        setFullAsset(asset)
        const map = new Map<number, AssetTypeAttribute>()
        propAttributes.forEach((attr, index) => map.set(index, attr))
        setAttributesMap(map)
        setTotalAttributeCount(propAttributes.length)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const data = await getAsset(organizationId, workspaceId, asset.id)
        setFullAsset(data)

        // Fetch attributes if not provided (or empty) and we have an asset type
        if ((!propAttributes || propAttributes.length === 0) && data.assetType) {
          const attrsResponse = await fetchAssetAttributeDefinitions(organizationId, workspaceId, data.assetType, 1, ATTRIBUTES_PAGE_SIZE)
          const map = new Map<number, AssetTypeAttribute>()
          const results = Array.isArray(attrsResponse.results) ? attrsResponse.results : []
          results.forEach((attr: AssetTypeAttribute, index: number) => map.set(index, attr))
          setAttributesMap(map)
          setTotalAttributeCount(attrsResponse.count || results.length)
        }
      } catch (error) {
        console.error('Error loading asset details:', error)
      } finally {
        setLoading(false)
      }
    }
    loadFullAsset()
  }, [asset?.id, organizationId, workspaceId, propAttributes])

  // Load more attributes when scrolling
  const handleLoadAttributeRange = useCallback(async (startIndex: number, endIndex: number) => {
    const displayAsset = fullAsset || asset
    if (!organizationId || !displayAsset?.assetType || attributesLoading) return

    // Calculate page number based on range
    const page = Math.floor(startIndex / ATTRIBUTES_PAGE_SIZE) + 1

    setAttributesLoading(true)
    try {
      const response = await fetchAssetAttributeDefinitions(
        organizationId,
        workspaceId,
        displayAsset.assetType,
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
  }, [organizationId, workspaceId, fullAsset, asset, attributesLoading])

  // Fetch related assets
  useEffect(() => {
    if (organizationId && asset?.id) {
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
  }, [organizationId, workspaceId, asset?.id])

  // Always show what we have - use the passed asset immediately, update when full data loads
  const displayAsset = fullAsset || asset

  // Build the share URL (current page URL)
  const shareUrl = useMemo(() => {
    const basePath = workspaceId
      ? `/organizations/${organizationId}/workspaces/${workspaceId}`
      : `/organizations/${organizationId}`
    return `${window.location.origin}${basePath}/asset-types/${displayAsset.assetType}/assets/${displayAsset.id}`
  }, [organizationId, workspaceId, displayAsset.assetType, displayAsset.id])

  // Build the view details URL
  const viewDetailsUrl = useMemo(() => {
    const basePath = workspaceId
      ? `/organizations/${organizationId}/workspaces/${workspaceId}`
      : `/organizations/${organizationId}`
    return `${basePath}/asset-types/${displayAsset.assetType}/assets/${displayAsset.id}`
  }, [organizationId, workspaceId, displayAsset.assetType, displayAsset.id])

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Pinned Overview Card - show immediately with available data */}
        <Box sx={{ flexShrink: 0 }}>
          {loading && !displayAsset.name ? (
            <Box sx={{ p: 2 }}>
              <Skeleton variant="text" width="60%" height={32} />
              <Skeleton variant="text" width="40%" height={20} sx={{ mt: 1 }} />
              <Skeleton variant="rectangular" height={60} sx={{ mt: 2, borderRadius: 1 }} />
            </Box>
          ) : (
            <AssetOverviewCard
              asset={displayAsset}
              mode="drawer"
              globalValuesOnly={globalValuesOnly}
              onGlobalValuesToggle={() => setGlobalValuesOnly(!globalValuesOnly)}
              onEdit={onEdit}
              shareUrl={shareUrl}
              viewDetailsUrl={viewDetailsUrl}
              onZoomToAsset={onZoomToAsset}
              onClone={() => console.debug('Clone asset:', asset.id)}
              onDownload={() => console.debug('Download asset:', asset.id)}
            />
          )}
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
              {cardOrder.map((cardId: string) => {
                switch (cardId) {
                  case 'attributes':
                    return (
                      <SortableCard key={cardId} id={cardId}>
                        {(dragHandleProps) => (
                          <Box sx={{ minHeight: 400, display: 'flex', flexDirection: 'column', flex: 1 }}>
                            {loading ? (
                              <Box sx={{ p: 2 }}>
                                <Skeleton variant="text" width="30%" height={24} sx={{ mb: 2 }} />
                                {[1, 2, 3, 4, 5].map(i => (
                                  <Box key={i} sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
                                    <Skeleton variant="text" width="35%" height={20} />
                                    <Skeleton variant="text" width="50%" height={20} />
                                  </Box>
                                ))}
                              </Box>
                            ) : (
                              <AttributesCard
                                asset={displayAsset}
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
                                isLoading={loading || attributesLoading}
                                dragHandleProps={dragHandleProps}
                              />
                            )}
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
                                assetTypeName: displayAsset.assetTypeName || (typeof displayAsset.assetType === 'string' ? displayAsset.assetType : 'Unknown'),
                                relatedUrl: '',
                                hasChildren: false
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
      </Box>
  )
}
