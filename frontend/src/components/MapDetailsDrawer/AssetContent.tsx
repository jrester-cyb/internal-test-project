import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Box, Chip, Skeleton, Typography } from '@mui/material'
import { DragHandle as DragHandleIcon, Public as PublicIcon } from '@mui/icons-material'
import type { Asset, AssetTypeAttribute } from '@app/types'
import { getAsset, fetchAssetAttributeDefinitions, fetchRelatedAssets } from '@app/api/assets'
import AssetOverviewCard from '@app/components/AssetOverviewCard'
import AttributesCard from '@app/components/AttributesCard'
import AssetTreeCard from '@app/components/AssetTreeCard'
import TasksCard from '@app/components/TasksCard'
import FilesCard from '@app/components/FilesCard'
import DragHandle from '@app/components/DragHandle'
import { useOrganization } from '@app/contexts/OrganizationContext'
import type { RelatedAssetsResponse } from '@app/api/assets'
import { getCachedFetch, cacheKeys } from '@app/utils/prefetchCache'

const ATTRIBUTES_PAGE_SIZE = 20
import {
  useSensors,
  useSensor,
  PointerSensor,
  KeyboardSensor,
  DndContext,
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DragEndEvent } from '@dnd-kit/core'

// Sortable card wrapper component - defined outside to prevent recreating on each render
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

export interface AssetContentProps {
  organizationId: string
  workspaceId?: string
  asset: Asset
  attributes?: AssetTypeAttribute[]
  onDelete?: (asset: Asset) => void
  onZoomToAsset?: (asset: Asset) => void
  onAssetUpdate?: (asset: Asset) => void
}

export default function AssetContent({
  organizationId,
  workspaceId,
  asset,
  attributes: propAttributes,
  onDelete,
  onZoomToAsset,
  onAssetUpdate,
}: AssetContentProps) {
  const { activeOrganization, isGlobalMode } = useOrganization()
  const [fullAsset, setFullAsset] = useState<Asset | null>(null)
  const [globalAsset, setGlobalAsset] = useState<Asset | null>(null)
  const [globalAssetLoading, setGlobalAssetLoading] = useState(false)
  const [attributesMap, setAttributesMap] = useState<Map<number, AssetTypeAttribute>>(() => {
    const map = new Map<number, AssetTypeAttribute>()
    if (Array.isArray(propAttributes)) {
      propAttributes.forEach((attr, index) => map.set(index, attr))
    }
    return map
  })
  const [globalAttributesMap, setGlobalAttributesMap] = useState<Map<number, AssetTypeAttribute>>(new Map())
  const [globalTotalAttributeCount, setGlobalTotalAttributeCount] = useState(0)
  const [totalAttributeCount, setTotalAttributeCount] = useState(Array.isArray(propAttributes) ? propAttributes.length : 0)
  // Start loading if we don't have attributes provided
  const [loading, setLoading] = useState(!propAttributes || propAttributes.length === 0)
  const [attributesLoading, setAttributesLoading] = useState(false)
  const [relatedAssets, setRelatedAssets] = useState<RelatedAssetsResponse | null>(null)
  const [relatedLoading, setRelatedLoading] = useState(true)
  const [relatedError, setRelatedError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [excludedScopes, setExcludedScopes] = useState<string[]>([])
  const [globalValuesOnly, setGlobalValuesOnly] = useState(false)

  // Card open/collapsed states
  const [cardOpenState, setCardOpenState] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('assetDetailsCardOpenState')
    return saved ? JSON.parse(saved) : { attributes: true, tree: true, tasks: true, files: true }
  })

  // Debounce localStorage save to avoid interfering with animations
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    saveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem('assetDetailsCardOpenState', JSON.stringify(cardOpenState))
    }, 300)
    return () => clearTimeout(saveTimeoutRef.current)
  }, [cardOpenState])

  const toggleCard = useCallback((cardId: string) => {
    setCardOpenState(prev => ({ ...prev, [cardId]: !prev[cardId] }))
  }, [])

  // Stable toggle callbacks for each card
  const toggleAttributes = useCallback(() => toggleCard('attributes'), [toggleCard])
  const toggleTree = useCallback(() => toggleCard('tree'), [toggleCard])
  const toggleTasks = useCallback(() => toggleCard('tasks'), [toggleCard])
  const toggleFiles = useCallback(() => toggleCard('files'), [toggleCard])

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

  useEffect(() => {
    // Reset state when asset changes - this ensures we show the new asset immediately
    setFullAsset(null)
    setGlobalAsset(null)
    setGlobalAttributesMap(new Map())
    setGlobalTotalAttributeCount(0)
    setGlobalValuesOnly(false)
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
        // Use cached fetch - will return prefetched data if available, otherwise fetch fresh
        const data = await getCachedFetch(
          cacheKeys.assetPrefetch(organizationId, workspaceId, asset.id),
          () => getAsset(organizationId, workspaceId, asset.id)
        )
        setFullAsset(data)

        // Fetch attributes if not provided (or empty) and we have an asset type
        if ((!propAttributes || propAttributes.length === 0) && data.assetType) {
          // Use cached fetch for attributes too
          const attrsResponse = await getCachedFetch(
            cacheKeys.assetAttributeDefinitions(organizationId, workspaceId, data.assetType),
            () => fetchAssetAttributeDefinitions(organizationId, workspaceId, data.assetType, 1, ATTRIBUTES_PAGE_SIZE)
          )
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

  // Fetch related assets - use cached fetch for prefetch benefit
  useEffect(() => {
    if (organizationId && asset?.id) {
      setRelatedLoading(true)
      setRelatedError(null)
      getCachedFetch(
        cacheKeys.relatedAssetsPrefetch(organizationId, workspaceId, asset.id),
        () => fetchRelatedAssets(organizationId, workspaceId, asset.id)
      )
        .then(setRelatedAssets)
        .catch((err) => {
          console.error('Failed to fetch related assets:', err)
          setRelatedError(err.message || 'Failed to load related assets')
        })
        .finally(() => setRelatedLoading(false))
    }
  }, [organizationId, workspaceId, asset?.id])

  // Fetch global asset data when globalValuesOnly is toggled on
  useEffect(() => {
    if (!globalValuesOnly || !organizationId || !asset?.id) return
    // If we already have the global asset loaded for this asset, skip
    if (globalAsset?.id === asset.id) return

    async function loadGlobalAsset() {
      setGlobalAssetLoading(true)
      try {
        // Fetch asset from org-level (no workspace) to get global values
        const data = await getAsset(organizationId!, undefined, asset!.id)
        setGlobalAsset(data)

        // Fetch global attribute definitions
        if (data.assetType) {
          const attrsResponse = await fetchAssetAttributeDefinitions(
            organizationId!,
            undefined, // No workspace = global
            data.assetType,
            1,
            ATTRIBUTES_PAGE_SIZE
          )
          const map = new Map<number, AssetTypeAttribute>()
          const results = Array.isArray(attrsResponse.results) ? attrsResponse.results : []
          results.forEach((attr: AssetTypeAttribute, index: number) => map.set(index, attr))
          setGlobalAttributesMap(map)
          setGlobalTotalAttributeCount(attrsResponse.count || results.length)
        }
      } catch (error) {
        console.error('Error loading global asset:', error)
      } finally {
        setGlobalAssetLoading(false)
      }
    }

    loadGlobalAsset()
  }, [globalValuesOnly, organizationId, asset?.id, globalAsset?.id])

  // Always show what we have - use the passed asset immediately, update when full data loads
  // When globalValuesOnly is true, use the global asset if available
  const displayAsset = globalValuesOnly && globalAsset ? globalAsset : (fullAsset || asset)

  // Select attributes based on globalValuesOnly mode
  const displayAttributesMap = globalValuesOnly ? globalAttributesMap : attributesMap
  const displayTotalAttributeCount = globalValuesOnly ? globalTotalAttributeCount : totalAttributeCount
  const isLoadingAttributes = globalValuesOnly ? globalAssetLoading : loading

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
          {(loading || (globalValuesOnly && globalAssetLoading)) && !displayAsset.name ? (
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
              onGlobalValuesToggle={isGlobalMode ? undefined : () => setGlobalValuesOnly(!globalValuesOnly)}
              shareUrl={shareUrl}
              viewDetailsUrl={viewDetailsUrl}
              onZoomToAsset={onZoomToAsset}
              onClone={() => console.debug('Clone asset:', asset.id)}
              onDownload={() => console.debug('Download asset:', asset.id)}
              organizationId={organizationId}
              workspaceId={workspaceId}
              assetTypeId={displayAsset.assetType}
              attributes={Array.from(displayAttributesMap.values())}
              onEditSuccess={(updatedAsset) => {
                setFullAsset(updatedAsset)
                onAssetUpdate?.(updatedAsset)
              }}
            />
          )}
        </Box>

        {/* Scrollable Cards Section */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Global Values Indicator */}
          {globalValuesOnly && (
            <Chip
              icon={<PublicIcon />}
              label="Showing Global Values"
              color="info"
              size="small"
              onDelete={() => setGlobalValuesOnly(false)}
              sx={{ alignSelf: 'flex-start' }}
            />
          )}

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
          <DndContext sensors={sensors} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
            <SortableContext items={cardOrder} strategy={rectSortingStrategy}>
              {cardOrder.map((cardId: string) => {
                switch (cardId) {
                  case 'attributes':
                    return (
                      <SortableCard key={cardId} id={cardId}>
                        {(dragHandleProps) => (
                          <AttributesCard
                            asset={displayAsset}
                            attributesMap={displayAttributesMap}
                            totalAttributeCount={displayTotalAttributeCount}
                            onLoadRange={globalValuesOnly ? undefined : handleLoadAttributeRange}
                            showHidden={showHidden}
                            onShowHiddenChange={setShowHidden}
                            selectedTags={selectedTags}
                            onSelectedTagsChange={setSelectedTags}
                            selectedTypes={selectedTypes}
                            onSelectedTypesChange={setSelectedTypes}
                            excludedScopes={excludedScopes}
                            onExcludedScopesChange={setExcludedScopes}
                            isLoading={isLoadingAttributes || attributesLoading}
                            defaultOpen={cardOpenState.attributes}
                            onToggle={toggleAttributes}
                            headerAction={<DragHandle {...dragHandleProps} />}
                          />
                        )}
                      </SortableCard>
                    )
                  case 'tree':
                    return (
                      <SortableCard key={cardId} id={cardId}>
                        {(dragHandleProps) => (
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
                            defaultOpen={cardOpenState.tree}
                            onToggle={toggleTree}
                            headerAction={<DragHandle {...dragHandleProps} />}
                          />
                        )}
                      </SortableCard>
                    )
                  case 'tasks':
                    return (
                      <SortableCard key={cardId} id={cardId}>
                        {(dragHandleProps) => (
                          <TasksCard
                            defaultOpen={cardOpenState.tasks}
                            onToggle={toggleTasks}
                            headerAction={<DragHandle {...dragHandleProps} />}
                          />
                        )}
                      </SortableCard>
                    )
                  case 'files':
                    return (
                      <SortableCard key={cardId} id={cardId}>
                        {(dragHandleProps) => (
                          <FilesCard
                            defaultOpen={cardOpenState.files}
                            onToggle={toggleFiles}
                            headerAction={<DragHandle {...dragHandleProps} />}
                          />
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
