import { useEffect, useRef, useCallback, useMemo, type ReactNode, type CSSProperties } from 'react'
import { Box, Skeleton, Typography } from '@mui/material'
import { VariableSizeList as List } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'

// Default skeleton placeholder for loading more items
const DefaultLoadingPlaceholder = (
  <Box sx={{ py: 1.5, px: 2 }}>
    <Skeleton variant="text" width="60%" height={24} />
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
      <Skeleton variant="rounded" width={80} height={24} />
      <Skeleton variant="text" width={100} height={16} />
    </Box>
  </Box>
)

export interface VirtualizedListProps<T> {
  /** Map of index to item for sparse data */
  items: Map<number, T>
  /** Unique key extractor for each item */
  getItemKey: (item: T, index: number) => string | number
  /** Render function for each item - receives item, index, and style to apply */
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode
  /** Estimated height for items (used before measurement) */
  estimatedItemHeight?: number
  /** Called when items at specific indices need to be loaded */
  onLoadRange?: (startIndex: number, endIndex: number) => void
  /** Total count of items (required for virtualized scrolling) */
  totalCount: number
  /** Whether currently loading items */
  isLoading?: boolean
  /** Message to show when list is empty */
  emptyMessage?: string
  /** Description to show when list is empty */
  emptyDescription?: string
  /** Optional header element rendered above the list */
  header?: ReactNode
  /** Optional footer element rendered below the list (e.g., loading indicator) */
  footer?: ReactNode
  /** Called when an item is clicked */
  onItemClick?: (item: T, index: number) => void
  /** Gap between items in pixels */
  itemGap?: number
  /** Outer element type for the list */
  outerElementType?: React.ComponentType<any>
  /** Inner element type for the list */
  innerElementType?: React.ComponentType<any>
  /** Class name for the list container */
  className?: string
  /** Padding for the list container */
  padding?: number | string
  /** Placeholder element to show for items not yet loaded */
  loadingPlaceholder?: ReactNode
}

interface ListHandle {
  scrollToItem: (index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start') => void
  resetAfterIndex: (index: number, shouldForceUpdate?: boolean) => void
}

export default function VirtualizedList<T>({
  items,
  getItemKey,
  renderItem,
  estimatedItemHeight = 50,
  onLoadRange,
  totalCount,
  isLoading = false,
  emptyMessage = 'No items',
  emptyDescription,
  header,
  footer,
  onItemClick,
  itemGap = 0,
  outerElementType,
  innerElementType,
  className,
  padding = 0,
  loadingPlaceholder,
}: VirtualizedListProps<T>) {
  const listRef = useRef<List>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const itemHeights = useRef<Map<number, number>>(new Map())
  const loadingRangesRef = useRef<Set<string>>(new Set())

  // Use refs for values that shouldn't cause re-renders of ItemWrapper
  const itemsRef = useRef(items)
  const renderItemRef = useRef(renderItem)
  const onItemClickRef = useRef(onItemClick)
  const getItemKeyRef = useRef(getItemKey)
  const onLoadRangeRef = useRef(onLoadRange)
  const placeholderContentRef = useRef(loadingPlaceholder ?? DefaultLoadingPlaceholder)

  // Update refs on each render
  itemsRef.current = items
  renderItemRef.current = renderItem
  onItemClickRef.current = onItemClick
  getItemKeyRef.current = getItemKey
  onLoadRangeRef.current = onLoadRange
  placeholderContentRef.current = loadingPlaceholder ?? DefaultLoadingPlaceholder

  // Get item height (measured or estimated)
  const getItemHeight = useCallback((index: number): number => {
    return itemHeights.current.get(index) ?? estimatedItemHeight + itemGap
  }, [estimatedItemHeight, itemGap])

  // Set item height after measurement
  const setItemHeight = useCallback((index: number, height: number) => {
    const currentHeight = itemHeights.current.get(index)
    const newHeight = height + itemGap
    if (currentHeight !== newHeight) {
      itemHeights.current.set(index, newHeight)
      listRef.current?.resetAfterIndex(index)
    }
  }, [itemGap])

  // Clear loading ranges when items change
  useEffect(() => {
    // When items are loaded, clear the loading ranges that are now satisfied
    loadingRangesRef.current.clear()
  }, [items.size])

  // Track pending range to load (for debouncing)
  const pendingRangeRef = useRef<{ start: number; end: number } | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced function to actually trigger the load
  const debouncedLoadRange = useMemo(() => {
    return () => {
      const currentOnLoadRange = onLoadRangeRef.current
      const pendingRange = pendingRangeRef.current

      if (!currentOnLoadRange || !pendingRange) return

      const rangeKey = `${pendingRange.start}-${pendingRange.end}`

      if (!loadingRangesRef.current.has(rangeKey)) {
        loadingRangesRef.current.add(rangeKey)
        currentOnLoadRange(pendingRange.start, pendingRange.end)
      }

      pendingRangeRef.current = null
    }
  }, [])

  // Handle visible range changes - load missing items (debounced)
  const handleItemsRendered = useCallback(({
    visibleStartIndex,
    visibleStopIndex
  }: {
    visibleStartIndex: number
    visibleStopIndex: number
  }) => {
    const currentOnLoadRange = onLoadRangeRef.current
    if (!currentOnLoadRange) return

    const currentItems = itemsRef.current

    // Find ranges of missing items within visible area (with some buffer)
    const bufferSize = 5
    const startIndex = Math.max(0, visibleStartIndex - bufferSize)
    const endIndex = Math.min(totalCount - 1, visibleStopIndex + bufferSize)

    // Find first missing item in range
    let missingStart: number | null = null
    let missingEnd: number | null = null

    for (let i = startIndex; i <= endIndex; i++) {
      const hasItem = currentItems.has(i)

      if (!hasItem && missingStart === null) {
        missingStart = i
      }

      if (hasItem && missingStart !== null && missingEnd === null) {
        missingEnd = i - 1
        break
      }
    }

    // If we started a range but didn't end it, end at endIndex
    if (missingStart !== null && missingEnd === null) {
      missingEnd = endIndex
    }

    // If we found a missing range, debounce the load request
    if (missingStart !== null && missingEnd !== null) {
      const rangeKey = `${missingStart}-${missingEnd}`

      // Skip if already loading this range
      if (loadingRangesRef.current.has(rangeKey)) return

      // Update pending range
      pendingRangeRef.current = { start: missingStart, end: missingEnd }

      // Clear existing timer and set new one
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(debouncedLoadRange, 150)
    }
  }, [totalCount, debouncedLoadRange])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Stable itemKey function that reads from refs
  const stableItemKey = useCallback((index: number): string | number => {
    const currentItems = itemsRef.current
    const currentGetItemKey = getItemKeyRef.current
    const item = currentItems.get(index)
    return item !== undefined
      ? currentGetItemKey(item, index)
      : `__placeholder_${index}__`
  }, [])

  // Item wrapper that measures height - use refs to avoid re-creating on data changes
  const ItemWrapper = useCallback(({ index, style }: { index: number; style: CSSProperties }) => {
    const currentItems = itemsRef.current
    const currentRenderItem = renderItemRef.current
    const currentOnItemClick = onItemClickRef.current
    const currentPlaceholder = placeholderContentRef.current

    const item = currentItems.get(index)

    // Show placeholder for items not yet loaded
    if (item === undefined) {
      return (
        <div style={style}>
          {currentPlaceholder}
        </div>
      )
    }

    const measureRef = (node: HTMLDivElement | null) => {
      if (node) {
        const height = node.getBoundingClientRect().height
        setItemHeight(index, height)
      }
    }

    const handleClick = currentOnItemClick ? () => currentOnItemClick(item, index) : undefined

    return (
      <div style={style}>
        <div ref={measureRef} onClick={handleClick} style={{ cursor: currentOnItemClick ? 'pointer' : undefined }}>
          {currentRenderItem(item, index, {})}
        </div>
      </div>
    )
  }, [setItemHeight])

  if (totalCount === 0 && !isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden'
        }}
        className={className}
      >
        {header}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            p: padding
          }}
        >
          <Typography variant="body1" color="text.secondary">
            {emptyMessage}
          </Typography>
          {emptyDescription && (
            <Typography variant="body2" color="text.secondary">
              {emptyDescription}
            </Typography>
          )}
        </Box>
        {footer}
      </Box>
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}
      className={className}
    >
      {header}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative', height: '100%' }}>
        <AutoSizer
          renderProp={({ height, width }) => (
            <List
              ref={listRef}
              outerRef={outerRef}
              height={height || 400}
              width={width || 300}
              itemCount={totalCount}
              itemSize={getItemHeight}
              estimatedItemSize={estimatedItemHeight + itemGap}
              itemKey={stableItemKey}
              outerElementType={outerElementType}
              innerElementType={innerElementType}
              style={{ padding: typeof padding === 'number' ? padding : undefined }}
              onItemsRendered={handleItemsRendered}
            >
              {ItemWrapper}
            </List>
          )}
        />

      </Box>
      {footer}
    </Box>
  )
}

// Export the handle type for consumers who want to control the list
export type { ListHandle as VirtualizedListHandle }
