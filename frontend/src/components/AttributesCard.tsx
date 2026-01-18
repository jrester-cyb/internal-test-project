import { useMemo, useCallback, type CSSProperties } from 'react'
import { Box, Typography, Skeleton } from '@mui/material'
import { Article as ArticleIcon, VisibilityOff as VisibilityOffIcon, FilterAlt as FilterIcon } from '@mui/icons-material'
import type { Asset, AssetTypeAttribute } from '@app/types'
import AttributeValueRenderer from '@app/components/AttributeValueRenderer'
import AttributeFilterPopover from '@app/components/AttributeFilterPopover'
import TagsDisplay from '@app/components/TagsDisplay'
import VirtualizedList from '@app/components/VirtualizedList'
import CollapsibleCard from '@app/components/CollapsibleCard'

interface AttributesCardProps {
  asset: Asset
  /** Map of index to attribute for sparse data (supports infinite scrolling) */
  attributesMap: Map<number, AssetTypeAttribute>
  /** Total count of attributes (for virtualization) */
  totalAttributeCount: number
  /** Callback to load more attributes */
  onLoadRange?: (startIndex: number, endIndex: number) => void
  showHidden: boolean
  onShowHiddenChange: (show: boolean) => void
  selectedTags: string[]
  onSelectedTagsChange: (tags: string[]) => void
  selectedTypes: string[]
  onSelectedTypesChange: (types: string[]) => void
  excludedScopes: string[]
  onExcludedScopesChange: (scopes: string[]) => void
  isLoading?: boolean
  /** Initial open state (for uncontrolled mode) */
  defaultOpen?: boolean
  /** Controlled open state */
  open?: boolean
  /** Callback when the card is toggled */
  onToggle?: () => void
  /** Additional action elements to render in the header */
  headerAction?: React.ReactNode
}

export default function AttributesCard({
  asset,
  attributesMap,
  totalAttributeCount,
  onLoadRange,
  showHidden,
  onShowHiddenChange,
  selectedTags,
  onSelectedTagsChange,
  selectedTypes,
  onSelectedTypesChange,
  excludedScopes,
  onExcludedScopesChange,
  isLoading = false,
  defaultOpen = true,
  open,
  onToggle,
  headerAction,
}: AttributesCardProps) {
  // Convert map to array for filtering
  const loadedAttributes = useMemo(() => {
    return Array.from(attributesMap.values())
  }, [attributesMap])

  // Get all unique tags from loaded attributes
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    loadedAttributes.forEach(attr => {
      attr.tags?.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [loadedAttributes])

  const hiddenCount = loadedAttributes.filter(attr => attr.isHidden).length

  return (
    <CollapsibleCard
      title="Attributes"
      defaultOpen={defaultOpen}
      open={open}
      onToggle={onToggle}
      headerAction={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AttributeFilterPopover
            showHidden={showHidden}
            onShowHiddenChange={onShowHiddenChange}
            selectedTags={selectedTags}
            onSelectedTagsChange={onSelectedTagsChange}
            selectedTypes={selectedTypes}
            onSelectedTypesChange={onSelectedTypesChange}
            excludedScopes={excludedScopes}
            onExcludedScopesChange={onExcludedScopesChange}
            showScopeFilter={true}
            hiddenCount={hiddenCount}
            availableTags={availableTags}
            showTypeFilter={true}
            isLoading={isLoading}
          />
          {headerAction}
        </Box>
      }
      contentSx={{ height: 400 }}
      disableContentPadding
    >
      <AttributesListContent
        asset={asset}
        attributesMap={attributesMap}
        totalAttributeCount={totalAttributeCount}
        onLoadRange={onLoadRange}
        showHidden={showHidden}
        selectedTags={selectedTags}
        onSelectedTagsChange={onSelectedTagsChange}
        selectedTypes={selectedTypes}
        excludedScopes={excludedScopes}
        isLoading={isLoading}
      />
    </CollapsibleCard>
  )
}

// Separate component for the list content to avoid inline function re-creation
interface AttributesListContentProps {
  asset: Asset
  attributesMap: Map<number, AssetTypeAttribute>
  totalAttributeCount: number
  onLoadRange?: (startIndex: number, endIndex: number) => void
  showHidden: boolean
  selectedTags: string[]
  onSelectedTagsChange: (tags: string[]) => void
  selectedTypes: string[]
  excludedScopes: string[]
  isLoading?: boolean
}

function AttributesListContent({
  asset,
  attributesMap,
  totalAttributeCount,
  onLoadRange,
  showHidden,
  selectedTags,
  onSelectedTagsChange,
  selectedTypes,
  excludedScopes,
  isLoading = false,
}: AttributesListContentProps) {
  // Apply filters to the sparse map - we need to filter the data that's loaded
  // For now, filters work on loaded data; server-side filtering would be better for large datasets
  const { filteredMap, filteredCount } = useMemo(() => {
    const hasFilters = !showHidden || selectedTags.length > 0 || selectedTypes.length > 0 || excludedScopes.length > 0

    if (!hasFilters) {
      return { filteredMap: attributesMap, filteredCount: totalAttributeCount }
    }

    // When filters are active, we can only show loaded items that match
    const filtered = new Map<number, AssetTypeAttribute>()
    let newIndex = 0

    for (const [, attr] of attributesMap) {
      // Filter by hidden
      if (!showHidden && attr.isHidden) continue

      // Filter by tags
      if (selectedTags.length > 0 && !attr.tags?.some(tag => selectedTags.includes(tag))) continue

      // Filter by types
      if (selectedTypes.length > 0 && (!attr.attributeType || !selectedTypes.includes(attr.attributeType))) continue

      // Filter by excluded scopes
      if (excludedScopes.length > 0) {
        const scope = attr.scope || 'global'
        if (excludedScopes.includes(scope)) continue
      }

      filtered.set(newIndex, attr)
      newIndex++
    }

    return { filteredMap: filtered, filteredCount: filtered.size }
  }, [attributesMap, totalAttributeCount, showHidden, selectedTags, selectedTypes, excludedScopes])

  // Determine empty state message
  const emptyMessage = useMemo(() => {
    if (totalAttributeCount === 0) {
      return { message: 'No attributes available', icon: <ArticleIcon sx={{ mr: 1, verticalAlign: 'middle' }} /> }
    }
    if (attributesMap.size > 0) {
      const allHidden = Array.from(attributesMap.values()).every(attr => attr.isHidden)
      if (allHidden && !showHidden) {
        return { message: 'All attributes are hidden for this asset type', icon: <VisibilityOffIcon sx={{ mr: 1, verticalAlign: 'middle' }} /> }
      }
    }
    if (selectedTags.length > 0 || selectedTypes.length > 0 || excludedScopes.length > 0) {
      return { message: 'No attributes match the current filters', icon: <FilterIcon sx={{ mr: 1, verticalAlign: 'middle' }} /> }
    }
    return { message: 'No attributes', icon: <ArticleIcon sx={{ mr: 1, verticalAlign: 'middle' }} /> }
  }, [totalAttributeCount, attributesMap, showHidden, selectedTags, selectedTypes, excludedScopes])

  // Get item key for virtualization
  const getItemKey = useCallback((item: AssetTypeAttribute, index: number) => {
    return item.id || `attr-${index}`
  }, [])

  // Render each attribute row
  const renderAttribute = useCallback((attr: AssetTypeAttribute, index: number, style: CSSProperties) => {
    const value = asset.attributes?.[attr.apiKey]
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
          px: 2,
          py: 1,
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'medium', mb: 0.5 }}>
            {attr.name}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {attr.attributeType || 'text'}
            </Typography>
            {attr.scope && attr.scope !== 'global' && (
              <>
                <Typography variant="caption" color="text.secondary">•</Typography>
                <Typography variant="caption" color="text.secondary">
                  {attr.scope}
                </Typography>
              </>
            )}
          </Box>
          {attr.description && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {attr.description}
            </Typography>
          )}
          {attr.tags && attr.tags.length > 0 && (
            <TagsDisplay
              tags={attr.tags}
              label={`Tags for ${attr.name}`}
              selectedTags={selectedTags}
              onTagClick={(tag) => {
                if (selectedTags.includes(tag)) {
                  onSelectedTagsChange(selectedTags.filter(t => t !== tag))
                } else {
                  onSelectedTagsChange([...selectedTags, tag])
                }
              }}
            />
          )}
        </Box>
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <AttributeValueRenderer attribute={attr} value={value} maxLines={3} />
        </Box>
      </Box>
    )
  }, [asset.attributes, selectedTags, onSelectedTagsChange])

  // Loading placeholder for items being fetched
  const loadingPlaceholder = useMemo(() => (
    <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
        <Skeleton variant="text" width="60%" height={24} />
        <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
          <Skeleton variant="text" width={60} height={16} />
          <Skeleton variant="text" width={80} height={16} />
        </Box>
      </Box>
      <Box sx={{ flex: 1 }}>
        <Skeleton variant="text" width="70%" height={24} />
      </Box>
    </Box>
  ), [])

  // Don't disable infinite loading when filters are active - we still want to load more data
  // The filtering happens client-side after data is loaded
  // Note: showHidden=false is the default (hide hidden items), so we only consider it a "filter"
  // when tags, types, or scopes are explicitly selected
  const hasActiveFilters = selectedTags.length > 0 || selectedTypes.length > 0 || excludedScopes.length > 0

  // When loading and no data yet, show placeholder rows
  // Use a reasonable default count so VirtualizedList shows skeletons
  const displayCount = hasActiveFilters
    ? filteredCount
    : (totalAttributeCount > 0 ? totalAttributeCount : (isLoading ? 5 : 0))

  if (displayCount === 0 && !isLoading) {
    return (
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography color="text.secondary" variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
          {emptyMessage.icon}
          {emptyMessage.message}
        </Typography>
      </Box>
    )
  }

  return (
    <VirtualizedList
      items={hasActiveFilters ? filteredMap : attributesMap}
      totalCount={displayCount}
      getItemKey={getItemKey}
      renderItem={renderAttribute}
      onLoadRange={hasActiveFilters ? undefined : onLoadRange}
      estimatedItemHeight={80}
      isLoading={isLoading}
      emptyMessage={emptyMessage.message}
      loadingPlaceholder={loadingPlaceholder}
    />
  )
}