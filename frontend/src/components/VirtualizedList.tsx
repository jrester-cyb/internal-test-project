import { useState, useEffect, useRef, useCallback, type ReactNode, type CSSProperties } from 'react'
import { Box, CircularProgress, Skeleton, Typography } from '@mui/material'
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
  /** Array of items to render */
  items: T[]
  /** Unique key extractor for each item */
  getItemKey: (item: T, index: number) => string | number
  /** Render function for each item - receives item, index, and style to apply */
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode
  /** Estimated height for items (used before measurement) */
  estimatedItemHeight?: number
  /** Called when more items should be loaded. Return the new items and whether there are more. */
  onLoadMore?: () => Promise<{ items: T[], hasMore: boolean }>
  /** Total count of items (for fixed-size lists where not all items are loaded yet) */
  totalCount?: number
  /** Whether there are more items to load (deprecated - use totalCount instead) */
  hasMore?: boolean
  /** Whether currently loading more items */
  isLoading?: boolean
  /** Threshold (0-1) for triggering load more. 0.8 = 80% scrolled */
  loadMoreThreshold?: number
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
  onLoadMore,
  totalCount,
  hasMore = false,
  isLoading = false,
  loadMoreThreshold = 0.8,
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
  // Use totalCount if provided, otherwise fall back to items.length (+ 1 if hasMore)
  const itemCount = totalCount ?? (items.length + (hasMore ? 1 : 0))
  const listRef = useRef<List>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const itemHeights = useRef<Map<number, number>>(new Map())
  const fetchInProgressRef = useRef(false)
  const [, forceUpdate] = useState({})

  // Use refs for values that shouldn't cause re-renders of ItemWrapper
  const itemsRef = useRef(items)
  const renderItemRef = useRef(renderItem)
  const onItemClickRef = useRef(onItemClick)
  const getItemKeyRef = useRef(getItemKey)
  const placeholderContentRef = useRef(loadingPlaceholder ?? DefaultLoadingPlaceholder)
  itemsRef.current = items
  renderItemRef.current = renderItem
  onItemClickRef.current = onItemClick
  getItemKeyRef.current = getItemKey
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

  // Track previous items length to detect additions vs removals
  const prevItemsLength = useRef(items.length)

  // Handle items length changes without resetting scroll
  useEffect(() => {
    const prevLength = prevItemsLength.current
    const newLength = items.length

    if (prevLength === newLength) return

    prevItemsLength.current = newLength

    if (newLength < prevLength) {
      // Items were removed - clear cached heights for removed items
      for (const index of itemHeights.current.keys()) {
        if (index >= newLength) {
          itemHeights.current.delete(index)
        }
      }
      // Reset from 0 but don't force scroll - just recalculate sizes
      listRef.current?.resetAfterIndex(0, false)
    }
    // For items added, we don't need to reset - react-window handles new itemCount automatically
  }, [items.length])

  // Refs for infinite scroll to avoid callback recreation
  const onLoadMoreRef = useRef(onLoadMore)
  const totalCountRef = useRef(totalCount)
  const hasMoreRef = useRef(hasMore)
  const isLoadingRef = useRef(isLoading)
  onLoadMoreRef.current = onLoadMore
  totalCountRef.current = totalCount
  hasMoreRef.current = hasMore
  isLoadingRef.current = isLoading

  // Infinite scroll handler using react-window's onItemsRendered callback
  // Use a stable callback that reads from refs to avoid recreating on data changes
  const handleItemsRendered = useCallback(({ visibleStopIndex }: { visibleStopIndex: number }) => {
    const currentOnLoadMore = onLoadMoreRef.current
    const currentTotalCount = totalCountRef.current
    const currentHasMore = hasMoreRef.current
    const currentIsLoading = isLoadingRef.current
    const currentItemsLength = itemsRef.current.length

    // Check if we have more to load
    const hasMoreToLoad = currentTotalCount ? currentItemsLength < currentTotalCount : currentHasMore
    if (!currentOnLoadMore || !hasMoreToLoad) return
    if (fetchInProgressRef.current || currentIsLoading) return

    // Trigger load more when within 5 rows of the end of loaded items
    const rowsFromEnd = currentItemsLength - visibleStopIndex - 1
    if (rowsFromEnd <= 5) {
      fetchInProgressRef.current = true
      currentOnLoadMore().finally(() => {
        fetchInProgressRef.current = false
      })
    }
  }, [])

  // Expose list methods via ref
  const scrollToItem = useCallback((index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start') => {
    listRef.current?.scrollToItem(index, align)
  }, [])

  const resetAfterIndex = useCallback((index: number, shouldForceUpdate = true) => {
    listRef.current?.resetAfterIndex(index, shouldForceUpdate)
  }, [])

  // Stable itemKey function that reads from refs
  const stableItemKey = useCallback((index: number): string | number => {
    const currentItems = itemsRef.current
    const currentGetItemKey = getItemKeyRef.current
    return index < currentItems.length
      ? currentGetItemKey(currentItems[index], index)
      : `__placeholder_${index}__`
  }, [])

  // Item wrapper that measures height - use refs to avoid re-creating on data changes
  const ItemWrapper = useCallback(({ index, style }: { index: number; style: CSSProperties }) => {
    const currentItems = itemsRef.current
    const currentRenderItem = renderItemRef.current
    const currentOnItemClick = onItemClickRef.current
    const currentPlaceholder = placeholderContentRef.current

    // Check if this index is beyond loaded items (show placeholder)
    const isPlaceholderRow = index >= currentItems.length

    if (isPlaceholderRow) {
      return (
        <div style={style}>
          {currentPlaceholder}
        </div>
      )
    }

    const item = currentItems[index]
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

  if (items.length === 0 && !isLoading) {
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
              itemCount={itemCount}
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

        {isLoading && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              bgcolor: 'background.paper',
              borderRadius: '50%',
              p: 1,
              boxShadow: 2
            }}
          >
            <CircularProgress size={24} />
          </Box>
        )}
      </Box>
      {footer}
    </Box>
  )
}

// Export the handle type for consumers who want to control the list
export type { ListHandle as VirtualizedListHandle }
